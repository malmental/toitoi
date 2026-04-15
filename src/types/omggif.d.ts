declare module "omggif" {
  interface FrameData {
    pixels: ArrayBuffer;
    delay: number;
  }

  class GifDecoder {
    constructor(buffer: Buffer);
    numFrames(): number;
    decodeFrame(index: number): FrameData;
    width: number;
    height: number;
  }

  class GifReader {
    constructor(buffer: Buffer);
    numFrames(): number;
    width: number;
    height: number;
    frameInfo(index: number): {
      disposal: number;
      delay: number;
    };
    decodeAndBlitFrameRGBA(index: number, pixels: Uint8Array): void;
  }

  interface GifWriterOptions {
    loop?: number;
    palette?: number[];
    background?: number;
  }

  interface FrameOptions {
    palette?: number[];
    delay?: number;
    disposal?: number;
    transparent?: number;
  }

  class GifWriter {
    constructor(buf: ArrayBuffer, width: number, height: number, options?: GifWriterOptions);
    addFrame(x: number, y: number, width: number, height: number, indices: number[], options?: FrameOptions): void;
    end(): number;
  }

  export { GifDecoder, GifReader, GifWriter };
}