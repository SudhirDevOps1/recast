/** Node-only entry point. Import from main-process code as `@recast/shared/node`. */
export { resolveFfmpeg, expectedBundledDir, dataDirLabel, type FfmpegResolution, type FfmpegSource } from './resolve';
export { FfmpegRunner, FfmpegError, type RunResult } from './runner';
