import type { Codec, CodecConstructor } from 'numcodecs';
type Config = Record<string, unknown>;
type CodecImporter = () => CodecConstructor<Config> | Promise<CodecConstructor<Config>>;
export declare function addCodec(id: string, importFn: CodecImporter): void;
export declare function getCodec(config: Config & {
    id: string;
}): Promise<Codec>;
export {};
