/**
 * ASCII Art GIF Converter
 * 
 * Este módulo convierte archivos GIF animados a secuencias de frames ASCII art.
 * Utiliza la librería omggif para decodificar los frames del GIF y los transforma
 * en caracteres ASCII basados en la luminosidad de cada píxel.
 * 
 * Referencia de implementación:
 * - Coeficientes de luminancia BT.601 para conversión RGB a escala de grises
 * - Umbral de transparencia del 8% para detectar áreas vacías
 * - Manejo de disposal method para GIFs animados (restaurar a fondo)
 */

import { readFileSync } from "fs";
import { GifReader } from "omggif";

/**
 * Estructura de un frame ASCII convertido
 */
export interface AsciiFrame {
  ascii: string;      // Frame renderizado como string de caracteres ASCII
  duration: number;    // Duración en milisegundos para reproducir el frame
}

/**
 * Opciones de conversión
 */
interface ConverterOptions {
  width?: number;         // Ancho del output ASCII en caracteres (columnas)
  height?: number;        // Alto del output ASCII en caracteres (filas)
  chars?: string;         // Charset para mapeo de luminosidad a caracteres
  enhance?: boolean;       // Modo stencil: convierte a alto contraste
  invert?: boolean;        // Invertir el output (fondo negro → blanco)
  bw?: boolean;           // Modo blanco y negro (binario)
  contrast?: number;       // Nivel de contraste (1.0 = normal, >1 = más contraste)
}

/**
 * Dimensiones por defecto del output ASCII
 */
const DEFAULT_WIDTH = 80;   // 80 columnas - estándar de terminal classic
const DEFAULT_HEIGHT = 25;  // 25 líneas - altura de terminal VGA clásica

/**
 * Charset para gradiente visual (de claro a oscuro)
 * Incluye: punto, coma, guión, dos puntos, igual, más, asterisco, numeral, arroba
 * Ordenados de menor a mayor "peso" visual (menos denso → más denso)
 * NOTA: No incluye espacio al inicio - el espacio se usa solo para transparencia
 */
const DEFAULT_CHARS = ".,-:=+*#%@";

/**
 * Charset especial para modo STENCIL (alto contraste)
 * Solo usa 2 caracteres: espacio (vacío) y numeral (sólido)
 * Ideal para GIFs con líneas suaves que necesitan ser "endurecidas"
 */
const STENCIL_CHARS = " #";

/**
 * Charset para modo B&W (blanco y negro)
 * Solo 2 caracteres: espacio (negro/fondo) y numeral (blanco/líneas)
 */
const BW_CHARS = " #";

/**
 * Convierte un archivo GIF animado a una secuencia de frames ASCII art
 * 
 * El proceso de conversión sigue estos pasos:
 * 1. Leer y decodificar el GIF usando omggif
 * 2. Para cada frame del GIF:
 *    a. Limpiar el canvas si el disposal method lo requiere
 *    b. Decodificar los píxeles del frame actual
 *    c. Escalar y mapear cada píxel a un carácter ASCII
 *    d. Construir el string ASCII del frame completo
 *    e. Opcionalmente aplicar post-process de stencil
 *    f. Opcionalmente invertir el output
 * 
 * @param gifPath - Ruta al archivo GIF de entrada
 * @param options - Opciones de conversión (dimensiones, charset)
 * @returns Array de frames ASCII con sus duraciones
 */
export async function gifToAscii(
  gifPath: string,
  options: ConverterOptions = {}
): Promise<AsciiFrame[]> {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    chars = DEFAULT_CHARS,
    enhance = false,
    invert = false,
    bw = false,
    contrast = 1.0,
  } = options;

  // ===================================================================
  // PASO 1: Lectura y decodificación inicial del GIF
  // ===================================================================
  
  /**
   * Lectura binaria del archivo GIF
   * omggif requiere el archivo completo en memoria para poder decodificarlo
   */
  const gifBuffer = readFileSync(gifPath);
  
  /**
   * GifReader de omggif
   * Proporciona acceso a metadatos del GIF (dimensiones, número de frames)
   * y métodos para decodificar frames individuales
   */
  const reader = new GifReader(gifBuffer);

  // Metadatos del GIF
  const numFrames = reader.numFrames();     // Total de frames en la animación
  const frameWidth = reader.width;           // Ancho original del GIF en píxeles
  const frameHeight = reader.height;        // Alto original del GIF en píxeles

  console.log(`📊 GIF: ${numFrames} frames, ${frameWidth}x${frameHeight}px`);

  const frames: AsciiFrame[] = [];

  // ===================================================================
  // PASO 2: Canvas persistente para composición de frames
  // ===================================================================
  
  /**
   * Canvas en memoria para composición de frames
   * 
   * Los GIFs animados usan diferentes "disposal methods" para manejar
   * cómo se combinan los frames. Para disposal=2 (restore to background),
   * necesitamos mantener un canvas persistente que se limpia entre frames.
   * 
   * Formato: RGBA (4 bytes por píxel)
   * - Índice 0: Rojo (0-255)
   * - Índice 1: Verde (0-255)
   * - Índice 2: Azul (0-255)
   * - Índice 3: Alpha (0-255)
   */
  const canvas = new Uint8Array(frameWidth * frameHeight * 4);

  // ===================================================================
  // PASO 3: Procesamiento de cada frame
  // ===================================================================
  
  for (let i = 0; i < numFrames; i++) {
    // -----------------------------------------------------------------
    // 3.1: Obtener información del frame actual
    // -----------------------------------------------------------------
    
    const frameInfo = reader.frameInfo(i);
    
    /**
     * Disposal Method (Método de eliminación)
     * Indica qué hacer con el canvas después de mostrar este frame:
     * - 0: No dispose (mantener como está)
     * - 1: No dispose (mantener como está)  
     * - 2: Restaurar a fondo (RESTORE_TO_BACKGROUND)
     * - 3: Restaurar a estado previo (RESTORE_TO_PREVIOUS)
     * 
     * El valor 2 es común en GIFs donde el fondo es transparente
     * y cada frame solo contiene los píxeles que cambiaron
     */
    const disposal = frameInfo.disposal;

    // -----------------------------------------------------------------
    // 3.2: Limpieza del canvas según disposal method
    // -----------------------------------------------------------------
    
    /**
     * Cuando disposal === 2, el canvas se debe limpiar (poner en cero)
     * antes de dibujar el nuevo frame.
     * Esto evita que píxeles de frames anteriores "se arrastren"
     * hacia frames siguientes cuando hay movimiento.
     */
    if (disposal === 2) {
      // Establecer todos los canales RGBA a 0 (transparente/negro)
      for (let j = 0; j < canvas.length; j += 4) {
        canvas[j] = 0;     // R = 0
        canvas[j + 1] = 0; // G = 0
        canvas[j + 2] = 0; // B = 0
        canvas[j + 3] = 0; // A = 0 (transparente)
      }
    }

    // -----------------------------------------------------------------
    // 3.3: Decodificar el frame actual sobre el canvas
    // -----------------------------------------------------------------
    
    /**
     * decodeAndBlitFrameRGBA decodifica los datos comprimidos del frame
     * y escribe los píxeles RGBA directamente en el buffer proporcionado.
     * 
     * Para disposal=2, el frame solo contiene los píxeles que CAMBIARON
     * respecto al frame anterior, por eso necesitamos el canvas persistente.
     */
    reader.decodeAndBlitFrameRGBA(i, canvas);

    // -----------------------------------------------------------------
    // 3.4: Conversión de píxeles a caracteres ASCII
    // -----------------------------------------------------------------
    
    /**
     * Escalado proporcional del canvas original al grid ASCII
     * 
     * Mapeo inverso: para cada posición (x, y) en el output ASCII,
     * calculamos qué píxel del GIF original le corresponde.
     * 
     * Math.floor asegura que no excedamos los límites del GIF original.
     */
    const asciiLines: string[] = [];

    for (let y = 0; y < height; y++) {
      let line = '';
      
      for (let x = 0; x < width; x++) {
        // Coordenadas proporcionales en el GIF original
        const srcX = Math.floor((x / width) * frameWidth);
        const srcY = Math.floor((y / height) * frameHeight);
        
        // Índice en el buffer RGBA (4 bytes por píxel)
        const idx = (srcY * frameWidth + srcX) * 4;

        // Extracción de componentes de color
        // ?? 0 maneja el caso de índices undefined (fuera de rango)
        const r = canvas[idx] ?? 0;         // Componente Rojo
        const g = canvas[idx + 1] ?? 0;     // Componente Verde
        const b = canvas[idx + 2] ?? 0;     // Componente Azul
        const a = (canvas[idx + 3] ?? 255) / 255; // Alpha normalizado a [0, 1]

        // -----------------------------------------------------------------
        // 3.4.1: Cálculo de luminosidad perceptiva (luminance)
        // -----------------------------------------------------------------
        
        /**
         * Fórmula de luminancia BT.601 (Rec. 601)
         * 
         * Esta fórmula pondera los canales RGB según la sensibilidad
         * del ojo humano a cada color:
         * - Verde (0.7152): mayor sensibilidad → mayor peso
         * - Rojo (0.2126): sensibilidad media
         * - Azul (0.0722): menor sensibilidad → menor peso
         * 
         * La multiplicación por alpha incorpora la transparencia:
         * - Píxeles completamente transparentes (alpha≈0) → luminosidad 0
         * - Píxeles opacos (alpha=1) → luminosidad total
         * 
         * Nota: Esta fórmula es estándar en conversión YUV/YIQ y es
         * la preferida para procesamiento de video e imagen digital.
         */
        let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;

        // -----------------------------------------------------------------
        // 3.4.2: Aplicar contraste
        // -----------------------------------------------------------------
        
        /**
         * Ajuste de contraste usando fórmula de contraste
         * 
         * Formula: ((lum/255 - 0.5) * contrast + 0.5) * 255
         * 
         * - contrast = 1.0: sin cambios
         * - contrast > 1.0: mayor diferencia entre claros y oscuros (más contraste)
         * - contrast < 1.0: menor diferencia (menos contraste)
         * 
         * Esto estira o comprime el rango de luminosidad
         */
        if (contrast !== 1.0) {
          lum = ((lum / 255 - 0.5) * contrast + 0.5) * 255;
          lum = Math.max(0, Math.min(255, lum)); // Clamp a [0, 255]
        }

        // -----------------------------------------------------------------
        // 3.4.3: Manejo de transparencia
        // -----------------------------------------------------------------
        
        /**
         * Umbral de transparencia: 0.08 (8%)
         * 
         * Píxeles con alpha menor a 0.08 se consideran "vacíos" y se
         * representan como espacios en blanco. Esto es crítico para
         * GIFs con fondos transparentes o semi-transparentes.
         * 
         * El valor 0.08 (≈20/255) fue calibrado empíricamente para
         * eliminar artifacts de fondo sin perder detalle en los bordes.
         */
        if (a < 0.08) {
          line += ' ';
          continue;
        }

        // -----------------------------------------------------------------
        // 3.4.4: Modo B&W (blanco y negro)
        // -----------------------------------------------------------------
        
        /**
         * Modo B&W: Conversión binaria
         * 
         * Cuando bw === true, la luminosidad se convierte a un valor
         * binario (0 o 255) basado en un threshold del 50% (128).
         * 
         * Esto crea un efecto de alto contraste donde solo hay dos valores:
         * - Negro (lum < 128): espacio
         * - Blanco (lum >= 128): '#'
         * 
         * Ideal para líneas muy definidas sin gradientes.
         */
        let charIndex: number;
        
        if (bw) {
          // Modo B&W: threshold binario
          charIndex = lum >= 128 ? 1 : 0;
        } else {
          // Modo normal: mapeo lineal a charset
          charIndex = Math.min(
            chars.length - 1,
            Math.floor((lum / 255) * (chars.length - 1))
          );
        }

        line += bw ? BW_CHARS[charIndex] : (chars[charIndex] || ' ');
      }
      
      asciiLines.push(line);
    }

    // -----------------------------------------------------------------
    // 3.5: Ensamblaje del frame final
    // -----------------------------------------------------------------
    
    /**
     * join('\n') convierte el array de líneas en un string multilínea
     * Cada línea representa una fila del output ASCII
     */
    let ascii = asciiLines.join("\n");

    // -----------------------------------------------------------------
    // 3.6: Post-process STENCIL (mejora de contraste)
    // -----------------------------------------------------------------
    
    /**
     * Modo STENCIL: Aplicación de threshold para alto contraste
     * 
     * Cuando enhance === true, el output se transforma a un representation
     * binaria (espacio vs carácter sólido) usando un threshold sobre la densidad del carácter.
     * 
     * El threshold determina qué caracteres se consideran "sólidos":
     * - Caracteres más densos que el threshold → '#'
     * - Caracteres más claros → ' ' (espacio)
     * 
     * Charset ordenado por densidad:
     * " .,-:=+*#%@"
     * 0123456789...
     * 
     * Threshold 4 = todo lo que esté en índice 4 o mayor (#, %, @)
     * se convierte a '#', el resto a espacio
     */
    if (enhance) {
      const STENCIL_THRESHOLD = 4; // Índice en el charset (después de ':')
      ascii = applyStencil(ascii, chars, STENCIL_THRESHOLD);
    }

    // -----------------------------------------------------------------
    // 3.7: Post-process INVERT (inversión de colores)
    // -----------------------------------------------------------------
    
    /**
     * Modo INVERT: Inversión del output
     * 
     * Cuando invert === true, el output se invierte:
     * - ' ' (espacio/fondo) → '#' (sólido)
     * - '#' (sólido) → ' ' (espacio/fondo)
     * 
     * Esto es útil para GIFs donde:
     * - El fondo es transparente/negro y las líneas son claras
     * - Se quiere remarcar más las líneas débilmente iluminadas
     */
    if (invert) {
      ascii = invertAscii(ascii);
    }

    /**
     * Conversión de delay de centisegundos a milisegundos
     * 
     * El formato GIF almacena delays en centisegundos (1/100 de segundo),
     * pero JavaScript usa milisegundos para setTimeout/requestAnimationFrame.
     * Multiplicamos por 10 para convertir.
     * 
     * Si delay es 0 o indefinido, usamos 30ms como fallback (≈33fps)
     */
    const delay = (frameInfo.delay && frameInfo.delay > 0) 
      ? frameInfo.delay * 10 
      : 30;

    frames.push({
      ascii,
      duration: delay,
    });
  }

  return frames;
}

/**
 * Post-process: Aplica efecto stencil a un frame ASCII
 * 
 * Convierte un frame con gradiente de caracteres a una representación
 * binaria (espacio vs sólido) usando un threshold sobre la densidad del carácter.
 * 
 * @param ascii - Frame ASCII de entrada (string multilínea)
 * @param originalChars - Charset original usado en la conversión
 * @param threshold - Índice mínimo del charset para considerar como "sólido"
 * @returns Frame con efecto stencil aplicado
 */
function applyStencil(ascii: string, originalChars: string, threshold: number): string {
  /**
   * Construir mapa de caracteres densos
   * 
   * Creamos un Set con todos los caracteres del charset original
   * que tienen índice >= threshold (son "sólidos")
   */
  const solidChars = new Set<string>();
  for (let i = threshold; i < originalChars.length; i++) {
    solidChars.add(originalChars[i]);
  }
  
  /**
   * Transformar cada línea del frame
   * 
   * Para cada carácter en el frame:
   * - Si está en solidChars → mantenerlo como '#'
   * - Si no está → reemplazar por ' ' (espacio)
   */
  const lines = ascii.split('\n');
  const stenciledLines = lines.map(line => {
    let result = '';
    for (const char of line) {
      result += solidChars.has(char) ? '#' : ' ';
    }
    return result;
  });
  
  return stenciledLines.join('\n');
}

/**
 * Post-process: Invierte un frame ASCII
 * 
 * Convierte ' ' (espacio) a '#' y viceversa.
 * Útil para GIFs con fondo oscuro y líneas claras.
 * 
 * @param ascii - Frame ASCII de entrada (string multilínea)
 * @returns Frame con inversión aplicada
 */
function invertAscii(ascii: string): string {
  const lines = ascii.split('\n');
  const invertedLines = lines.map(line => {
    let result = '';
    for (const char of line) {
      result += char === ' ' ? '#' : ' ';
    }
    return result;
  });
  return invertedLines.join('\n');
}

/**
 * Imprime un frame ASCII en la consola
 * Útil para debugging y previews rápidos
 * 
 * @param ascii - String conteniendo el frame ASCII multilínea
 */
export function printAscii(ascii: string): void {
  console.log(ascii);
}
