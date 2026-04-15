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

  export { GifDecoder };
}
