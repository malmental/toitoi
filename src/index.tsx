/**
 * GIF to ASCII Art Converter - Terminal User Interface
 * 
 * Aplicación TUI (Terminal User Interface) para convertir archivos GIF
 * animados a secuencias de frames ASCII art y exportarlos como JSON.
 * 
 * Arquitectura:
 * - OpenTUI como framework de rendering TUI
 * - Estado local con React hooks (useState, useCallback, useEffect)
 * - Conversión via módulo ascii-converter.ts
 * 
 * Flujo de usuario:
 * 1. Ingresar ruta del GIF
 * 2. Click en "Convert" para procesar
 * 3. Preview de frames con controles de reproducción
 * 4. Exportar a JSON para usar en web/portfolio
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useState, useCallback, useEffect } from "react";
import { gifToAscii, type AsciiFrame } from "./ascii-converter.ts";
import { writeFileSync, existsSync } from "fs";
import { basename, extname } from "path";

/**
 * Estados posibles de la aplicación
 * 
 * - idle: Estado inicial, esperando input del usuario
 * - converting: Procesamiento del GIF en curso
 * - preview: Preview disponible, listo para reproducir/exportar
 * - exported: Exportación completada exitosamente
 * - error: Error en alguna operación (archivo no encontrado, etc.)
 */
type AppStatus = "idle" | "converting" | "preview" | "exported" | "error";

/**
 * Opciones de post-process disponibles
 */
interface Options {
  enhance: boolean;  // Modo stencil
  invert: boolean;    // Inversión de colores
  bw: boolean;       // Blanco y negro
  contrast: number; // Nivel de contraste
  charset: 'gradient' | 'retro'; // Tipo de charset
}

/**
 * Componente principal de la aplicación
 * 
 * Estructura visual (layout vertical):
 * 
 * +--------------------------------------------------+
 * |  [Input: path]                    [Convert]      |  <- Barra de controls
 * |  [◀] [▶/⏸] [▶]  12/108  [+] [~] [B] [C] [Export] |
 * +--------------------------------------------------+
 * |                                                  |
 * |              [PREVIEW ASCII]                    |  <- Área de preview
 * |           (centrado verticalmente)               |
 * |                                                  |
 * +--------------------------------------------------+
 * |  108 frames (stencil+invert)                    |  <- Status bar
 * +--------------------------------------------------+
 */
function App() {
  // =====================================================================
  // ESTADO DE LA APLICACIÓN
  // =====================================================================
  
  /**
   * Ruta del archivo GIF a convertir
   * Default: input/1.gif (relativo al directorio del proyecto)
   */
  const [gifPath, setGifPath] = useState("input/1.gif");
  
  /**
   * Estado actual de la aplicación
   * Controla qué componentes UI se muestran en cada momento
   */
  const [status, setStatus] = useState<AppStatus>("idle");
  
  /**
   * Frames ASCII convertidos
   * Array de objetos {ascii: string, duration: number}
   */
  const [frames, setFrames] = useState<AsciiFrame[]>([]);
  
  /**
   * Índice del frame actualmente seleccionado en el preview
   * Usado para navegación manual y sync con playback
   */
  const [previewIndex, setPreviewIndex] = useState(0);
  
  /**
   * Flag de reproducción automática
   * true = animando, false = pausado
   */
  const [isPlaying, setIsPlaying] = useState(false);
  
  /**
   * Mensaje de error a mostrar (si status === 'error')
   */
  const [errorMsg, setErrorMsg] = useState("");
  
  /**
   * Ruta del último archivo exportado
   * Mostrada al usuario tras exportar exitosamente
   */
  const [outputPath, setOutputPath] = useState("");

  /**
   * Opciones de post-process
   * 
   * - enhance: Modo stencil - endurece líneas suaves a alto contraste
   * - invert: Inversión del output (fondo → líneas, líneas → fondo)
   * - bw: Modo blanco y negro - convierte a binario puro
   * - contrast: Nivel de contraste (1.0 = normal, >1.0 = más contraste)
   * - charset: 'gradient' (.,-:=+*#%@) o 'retro' (░▒▓█)
   */
  const [options, setOptions] = useState<Options>({
    enhance: false,
    invert: false,
    bw: false,
    contrast: 1.0,
    charset: 'gradient',
  });

  // =====================================================================
  // HANDLERS DE OPCIONES
  // =====================================================================

  /**
   * Toggle del modo STENCIL (enhance)
   * 
   * Activa/desactiva el post-process de endurecimiento de líneas.
   * El cambio se aplica al siguiente Convert.
   */
  const toggleEnhance = useCallback(() => {
    setOptions(prev => ({ ...prev, enhance: !prev.enhance }));
  }, []);

  /**
   * Toggle del modo INVERT
   * 
   * Activa/desactiva la inversión de colores.
   * El cambio se aplica al siguiente Convert.
   */
  const toggleInvert = useCallback(() => {
    setOptions(prev => ({ ...prev, invert: !prev.invert }));
  }, []);

  /**
   * Toggle del modo B&W (blanco y negro)
   * 
   * Activa/desactiva la conversión binaria.
   * El cambio se aplica al siguiente Convert.
   */
  const toggleBw = useCallback(() => {
    setOptions(prev => ({ ...prev, bw: !prev.bw }));
  }, []);

  /**
   * Cycle del nivel de contraste
   * 
   * Alterna entre valores predefinidos: 1.0 → 1.5 → 2.0 → 1.0
   * El cambio se aplica al siguiente Convert.
   */
  const cycleContrast = useCallback(() => {
    const values = [1.0, 1.5, 2.0, 2.5, 3.0];
    const currentIdx = values.indexOf(options.contrast);
    const nextIdx = (currentIdx + 1) % values.length;
    setOptions(prev => ({ ...prev, contrast: values[nextIdx] }));
  }, [options.contrast]);

  /**
   * Toggle del charset (retro blocks)
   * 
   * Alterna entre gradient (.,-:=+*#%@) y retro (░▒▓█)
   */
  const toggleCharset = useCallback(() => {
    setOptions(prev => ({ 
      ...prev, 
      charset: prev.charset === 'gradient' ? 'retro' : 'gradient'
    }));
  }, []);

  // =====================================================================
  // HANDLERS DE ACCIONES
  // =====================================================================

  /**
   * Handler de conversión GIF → ASCII
   * 
   * Valida que el archivo exista, inicia la conversión,
   * actualiza el estado y resetea el índice de preview.
   * 
   * Función envuelta en useCallback para memorización,
   * evitando re-renderizados innecesarios.
   */
  const handleConvert = useCallback(async () => {
    // Validación: no procesar si no hay ruta
    if (!gifPath) return;
    
    // Validación: verificar existencia del archivo
    if (!existsSync(gifPath)) {
      setStatus("error");
      setErrorMsg(`File "${gifPath}" not found`);
      return;
    }

    // Transición a estado "convirtiendo"
    setStatus("converting");
    setErrorMsg("");

    try {
      // Transformar charset de opción a string de caracteres
      const chars = options.charset === 'retro' 
        ? " \u2591\u2592\u2593\u2588"  // " ░▒▓█"
        : ".,-:=+*#%@";
      
      // Llamada al módulo de conversión con todas las opciones
      const result = await gifToAscii(gifPath, { ...options, chars });
      
      // Actualizar estado con frames convertidos
      setFrames(result);
      setPreviewIndex(0);
      setStatus("preview");
    } catch (err: any) {
      // Manejo de errores durante conversión
      setStatus("error");
      setErrorMsg(err?.message || "Unknown error");
    }
  }, [gifPath, options]);

  /**
   * Handler de exportación a JSON
   * 
   * Escribe los frames al archivo JSON en src/assets/animation/
   * Usa el nombre base del GIF original para el archivo de salida.
   * 
   * Ejemplo: input/gif_3.gif → src/assets/animation/gif_3.json
   */
  const handleExport = useCallback(() => {
    if (frames.length === 0) return;
    
    const baseName = basename(gifPath, extname(gifPath));
    const out = `src/assets/animation/${baseName}.json`;
    
    // Serialización JSON con indentación para legibilidad
    writeFileSync(out, JSON.stringify(frames, null, 2));
    
    setOutputPath(out);
    setStatus("exported");
  }, [frames, gifPath]);

  /**
   * Toggle de reproducción play/pause
   * Simplemente invierte el estado de isPlaying
   */
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // =====================================================================
  // LOOP DE ANIMACIÓN (useEffect)
  // =====================================================================

  /**
   * Effect para reproducción automática de frames
   * 
   * Usa el delay de cada frame para sincronizar la animación
   * con el timing original del GIF.
   * 
   * Cleanup: cancela el timeout cuando se desmonta el componente
   * o cuando isPlaying cambia a false.
   */
  useEffect(() => {
    // No ejecutar si no está reproduciendo o no hay frames
    if (!isPlaying || frames.length === 0) return;
    
    const frame = frames[previewIndex];
    if (!frame) return;
    
    // Programar siguiente transición de frame según su duración
    const timer = setTimeout(() => {
      setPreviewIndex(prev => (prev + 1) % frames.length);
    }, frame.duration);
    
    // Función de cleanup - cancela el timeout
    return () => clearTimeout(timer);
  }, [isPlaying, previewIndex, frames]);

  // =====================================================================
  // HANDLERS DE NAVEGACIÓN
  // =====================================================================

  /**
   * Ir al frame anterior
   * Pausa la reproducción y retrocede una posición
   */
  const goPrev = useCallback(() => {
    setIsPlaying(false);
    setPreviewIndex(p => Math.max(0, p - 1));
  }, []);

  /**
   * Ir al siguiente frame
   * Pausa la reproducción y avanza una posición
   */
  const goNext = useCallback(() => {
    setIsPlaying(false);
    setPreviewIndex(p => Math.min(frames.length - 1, p + 1));
  }, [frames.length]);

  // =====================================================================
  // DERIVACIÓN DE ESTADO
  // =====================================================================

  /**
   * Frame actual seleccionado para preview
   * Obtenido del array de frames usando previewIndex
   */
  const currentFrame = frames[previewIndex];
  
  /**
   * Líneas de texto del frame actual
   * Divididas por el carácter de nueva línea
   */
  const lines = currentFrame?.ascii.split("\n") ?? [];
  
  /**
   * String de progreso "actual/total"
   * Ejemplo: "12/108"
   */
  const progress = frames.length > 0 
    ? `${previewIndex + 1}/${frames.length}` 
    : "";

  /**
   * Construir string de opciones activas para el status
   */
  const optionsStr = [
    options.charset === 'retro' ? 'retro' : '',
    options.enhance ? 'stencil' : '',
    options.invert ? 'invert' : '',
    options.bw ? 'B&W' : '',
    options.contrast !== 1.0 ? `C${options.contrast}` : '',
  ].filter(Boolean).join('+');

  // =====================================================================
  // RENDERIZADO DE LA UI
  // =====================================================================

  return (
    /**
     * Box principal con layout de columna
     * flexGrow={1} indica que ocupa todo el espacio disponible
     */
    <box flexDirection="column" flexGrow={1}>
      
      {/* ---------------------------------------------------------------
         BARRA DE CONTROLES SUPERIOR
         Contiene: input de ruta, botón convert, controles de playback
         --------------------------------------------------------------- */}
      <box flexDirection="row" alignItems="center" gap={1}>
        
        {/* Input para la ruta del GIF */}
        <input
          value={gifPath}
          onInput={setGifPath}
          onSubmit={handleConvert}  // Enter ejecuta conversión
          placeholder="path"
          flexGrow={1}
        />
        
        {/* Botón de conversión */}
        <box 
          focusable={true} 
          border={true} 
          borderStyle="single" 
          onMouseDown={handleConvert}
        >
          <text>Convert</text>
        </box>
        
        {/* Controles de playback - solo visibles en preview/exported */}
        {(status === "preview" || status === "exported") && frames.length > 0 && (
          <>
            {/* Botón frame anterior */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={goPrev}
            >
              <text>◀</text>
            </box>
            
            {/* Botón play/pause */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={togglePlay}
            >
              <text>{isPlaying ? "⏸" : "▶"}</text>
            </box>
            
            {/* Botón siguiente frame */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={goNext}
            >
              <text>▶</text>
            </box>

            {/* Botón STENCIL - modo de alto contraste */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={toggleEnhance}
            >
              <text>{options.enhance ? "[+]" : "[ ]"}</text>
            </box>

            {/* Botón INVERT - inversión de colores */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={toggleInvert}
            >
              <text>{options.invert ? "[~]" : "[ ]"}</text>
            </box>

            {/* Botón RETRO - bloques retro Unicode */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={toggleCharset}
            >
              <text>{options.charset === 'retro' ? "[█]" : "[ ]"}</text>
            </box>

            {/* Botón B&W - blanco y negro */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={toggleBw}
            >
              <text>{options.bw ? "[B]" : "[ ]"}</text>
            </box>

            {/* Botón CONTRAST - nivel de contraste */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={cycleContrast}
            >
              <text>{options.contrast === 1.0 ? "[C]" : `[C${options.contrast}]`}</text>
            </box>
            
            {/* Botón de exportación */}
            <box 
              focusable={true} 
              border={true} 
              borderStyle="single" 
              onMouseDown={handleExport}
            >
              <text>Export</text>
            </box>
          </>
        )}
      </box>

      {/* ---------------------------------------------------------------
         ÁREA DE PREVIEW
         Muestra el frame ASCII actual centrado en el espacio disponible
         --------------------------------------------------------------- */}
      <box flexGrow={1} border={true} borderStyle="single">
        <box 
          flexGrow={1} 
          flexDirection="column" 
          justifyContent="center" 
          alignItems="center"
        >
          {/* Estado: idle */}
          {status === "idle" && (
            <text>Enter path + Convert</text>
          )}
          
          {/* Estado: convirtiendo */}
          {status === "converting" && (
            <text>Converting...</text>
          )}
          
          {/* Estado: error */}
          {status === "error" && (
            <text>❌ {errorMsg}</text>
          )}
          
          {/* Estado: preview o exported - mostrar frames */}
          {(status === "preview" || status === "exported") && 
            lines.map((line, i) => (
              <text key={i}>{line || " "}</text>
            ))
          }
        </box>
      </box>

      {/* ---------------------------------------------------------------
         BARRA DE STATUS INFERIOR
         Muestra el estado actual y mensajes de feedback
         --------------------------------------------------------------- */}
      <box justifyContent="space-between">
        <text>
          {status === "idle" && "Ready"}
          {status === "converting" && "Converting..."}
          {status === "preview" && `${frames.length} frames${optionsStr ? ` (${optionsStr})` : ''}`}
          {status === "exported" && "✓ Exported"}
          {status === "error" && `Error: ${errorMsg}`}
        </text>
        <text>
          {(status === "preview" || status === "exported") && frames.length > 0 && progress}
        </text>
      </box>
    </box>
  );
}

/**
 * Inicialización del renderer CLI y mounting de la aplicación
 * 
 * OpenTUI requiere:
 * 1. createCliRenderer() - crea una instancia del renderer
 * 2. createRoot(renderer) - prepara el contenedor
 * 3. render(<App />) - monta el componente React
 */
const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
