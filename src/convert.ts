/**
 * Script CLI para conversión de GIF a ASCII
 * 
 * Uso directo desde línea de comandos para convertir un GIF a JSON
 * sin necesidad de iniciar la interfaz TUI completa.
 * 
 * Ejecución:
 *   bun run src/convert.ts <archivo.gif>
 * 
 * Output:
 *   - Preview de los primeros 3 frames en consola
 *   - Archivo JSON con todos los frames en el directorio actual
 */

import { gifToAscii } from "./ascii-converter.ts";
import { writeFileSync, existsSync } from "fs";
import { basename, extname } from "path";

// =====================================================================
// VALIDACIÓN DE ARGUMENTOS
// =====================================================================

/**
 * Obtiene la ruta del GIF desde los argumentos de línea de comandos
 * process.argv[0] = ruta de bun
 * process.argv[1] = ruta del script (src/convert.ts)
 * process.argv[2] = primer argumento del usuario (ruta del GIF)
 */
const gifPath = process.argv[2];

/**
 * Validación: verificar que se proporcionó una ruta
 * Si no hay argumentos, mostrar mensaje de uso y salir con código de error
 */
if (!gifPath) {
  console.error("Uso: bun run src/convert.ts <archivo.gif>");
  console.error("Ejemplo: bun run src/convert.ts mi-animacion.gif");
  process.exit(1);
}

/**
 * Validación: verificar que el archivo existe en el filesystem
 * Si no existe, mostrar error y salir
 */
if (!existsSync(gifPath)) {
  console.error(`Error: El archivo "${gifPath}" no existe`);
  process.exit(1);
}

// =====================================================================
// CONVERSIÓN
// =====================================================================

console.log("🎨 Convirtiendo GIF a ASCII...");
console.log(`📁 Archivo: ${gifPath}`);

/**
 * Llamada al módulo de conversión
 * 
 * Opciones de conversión:
 * - width: 100 columnas (mayor definición que el default de 80)
 * - height: 35 líneas (proporción similar al original)
 * 
 * El charset default " .,-:=+*#%@" se usa automáticamente
 */
const frames = await gifToAscii(gifPath, { width: 100, height: 35 });

console.log(`✅ ${frames.length} frames extraídos\n`);

// =====================================================================
// PREVIEW EN CONSOLA
// =====================================================================

/**
 * Mostrar preview de los primeros 3 frames
 * Útil para verificar la calidad de la conversión
 */
console.log("=== PREVIEW (primeros 3 frames) ===\n");

for (let i = 0; i < Math.min(3, frames.length); i++) {
  const frame = frames[i];
  if (!frame) continue;
  
  console.log(`--- Frame ${i + 1}/${frames.length} ---`);
  console.log(frame.ascii);
  console.log(`(duración: ${frame.duration}ms)\n`);
}

/**
 * Indicador de frames adicionales si hay más de 3
 */
if (frames.length > 3) {
  console.log(`... y ${frames.length - 3} frames más\n`);
}

// =====================================================================
// EXPORTACIÓN A JSON
// =====================================================================

/**
 * Generación del nombre de archivo de salida
 * 
 * Ejemplos:
 *   "animacion.gif" → "animacion.json"
 *   "ruta/al/archivo.GIF" → "archivo.json"
 * 
 * basename() extrae el nombre sin extensión
 * extname() obtiene la extensión (.gif, .GIF, etc.)
 */
const baseName = basename(gifPath, extname(gifPath));
const outputPath = `${baseName}.json`;

console.log(`💾 Exportando a: ${outputPath}`);

/**
 * Escritura del archivo JSON
 * 
 * JSON.stringify(frames, null, 2) formatea el JSON con indentación
 * de 2 espacios para legibilidad humana
 */
writeFileSync(outputPath, JSON.stringify(frames, null, 2));

console.log("✅ ¡Listo! Ya podés usar el JSON en tu app TUI.");
console.log(`   Copialo a: src/assets/animation/${baseName}.json`);
