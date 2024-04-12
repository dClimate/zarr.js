export type ZarrMetadataType = ZarrArrayMetadata | ZarrGroupMetadata;
export type UserAttributes = Record<string, any>;

/**
 * A scalar value providing the default value to use for uninitialized portions of the array, or `null` if no fill_value is to be used.
 */
export type FillType = number | null;

export type FillTypeSerialized = number | 'NaN' | 'Infinity' | '-Infinity' | null;

/**
 * Either `"C"` or `"F"`, defining the layout of bytes within each chunk of the array. `“C”` means row-major order, i.e., the last dimension varies fastest; `“F”` means column-major order, i.e., the first dimension varies fastest.
 */
export type Order = 'C' | 'F';
/**
 * Currently supported dtypes are listed here only.
 */
export type DtypeString =
  | '|u1'
  | '|i1'
  | '|b'
  | '|b1'
  | '|B'
  | '<u1'
  | '<i1'
  | '<b'
  | '<B'
  | '<u2'
  | '<i2'
  | '<u4'
  | '<i4'
  | '<f2'
  | '<f4'
  | '<f8'
  | '>u1'
  | '>i1'
  | '>b'
  | '>B'
  | '>u2'
  | '>i2'
  | '>u4'
  | '>i4'
  | '>f4'
  | '>f2'
  | '>f8';

/**
 * User interface for chunking.
 * - `null` or `true`: Automatic chunking (zarr will try to guess an appropriate) - not supported yet.
 * - `false`: No chunking
 * - `(number | null)[]`: One entry per dimension, the list gets padded with `null` for missing dimensions.
 *   - `number > 0`: Chunks of given size along dimension.
 *   - `null` or `-1`: No chunking along this dimension.
 */
export type ChunksArgument = number | (number | null)[] | boolean | null;

export interface CompressorConfig {
  id: string;
}
export interface Filter {
  id: string;
}

export interface ZarrArrayMetadata {
  /**
   * An integer defining the version of the storage specification to which the array store adheres.
   */
  zarr_format: 1 | 2;

  /**
   * A list of integers defining the length of each dimension of the array.
   */
  shape: number[];

  /**
   * A list of integers defining the length of each dimension of a chunk of the array. Note that all chunks within a Zarr array have the same shape.
   */
  chunks: number[];

  /**
   * A string or list defining a valid data type for the array. See https://zarr.readthedocs.io/en/stable/spec/v2.html#data-type-encoding.
   * Lists are not supported yet
   * Only a subset of types are supported in this library (for now), see the docs.
   */
  dtype: DtypeString; // | DtypeString[];

  /**
   * A JSON object identifying the primary compression codec and providing configuration parameters, or null if no compressor is to be used. The object MUST contain an "id" key identifying the codec to be used.
   */
  compressor: null | CompressorConfig & Record<string, any>;

  /**
   * A scalar value providing the default value to use for uninitialized portions of the array, or `null` if no fill_value is to be used.
   */
  fill_value: FillTypeSerialized;

  /**
   * Either `"C"` or `"F"`, defining the layout of bytes within each chunk of the array. `“C”` means row-major order, i.e., the last dimension varies fastest; `“F”` means column-major order, i.e., the first dimension varies fastest.
   */
  order: Order;

  /**
   * A list of JSON objects providing codec configurations, or `null` if no filters are to be applied. Each codec configuration object MUST contain a `"id"` key identifying the codec to be used.
   */
  filters: null | Filter[];


  /**
   * Separator placed between the dimensions of a chunk.
   */
  dimension_separator?: '.' | '/';
}

export interface ZarrGroupMetadata {
  /**
   * An integer defining the version of the storage specification to which the array store adheres.
   */
  zarr_format: 1 | 2;
}

/**
 * Persistence mode:
 * * 'r' means read only (must exist);
 * * 'r+' meansread/write (must exist);
 * * 'a' means read/write (create if doesn't exist);
 * * 'w' means create (overwrite if exists);
 * * 'w-' means create (fail if exists).
 */
export type PersistenceMode = 'r' | 'r+' | 'a' | 'w' | 'w-';


/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * This is a lightweight typescript definition for the IPFS HTTP Client.
 * It is not complete as the original definition takes about 200kb. This is about 3kb.
 * I use `any` in many cases to avoid having to import all the types from the original definition.
 * This is not ideal but it is a good tradeoff for now.
 * Copied from https://github.com/ipfs/js-ipfs
 * Please refer to the original definition in the link for more information.
 */

interface RootAPI {
  add: (entry: any, options?: any) => Promise<AddResult>;
  addAll: (source: any, options?: any) => AsyncIterable<AddResult>;
  cat: (ipfsPath: any, options?: any) => AsyncIterable<Uint8Array>;
  get: (ipfsPath: any, options?: any) => AsyncIterable<Uint8Array>;
  ls: (ipfsPath: any, options?: any) => AsyncIterable<IPFSEntry>;
  id: (options?: any) => Promise<IDResult>;
  version: (options?: any) => Promise<VersionResult>;
  dns: (domain: string, options?: any) => Promise<string>;
  start: () => Promise<void>;
  stop: (options?: any) => Promise<void>;
  ping: (peerId: string, options?: any) => AsyncIterable<PingResult>;
  resolve: (name: string, options?: any) => Promise<string>;
  commands: (options?: any) => Promise<string[]>;
  mount: (options?: any) => Promise<MountResult>;
  isOnline: () => boolean;
}

interface IPFSEntry {
  readonly type: "dir" | "file";
  readonly cid: any;
  readonly name: string;
  readonly path: string;
  mode?: number;
  mtime?: any;
  size: number;
}

interface AddResult {
  cid: any;
  size: number;
  path: string;
  mode?: number;
  mtime?: any;
}

interface IDResult {
  id: string;
  publicKey: string;
  addresses: any[];
  agentVersion: string;
  protocolVersion: string;
  protocols: string[];
}

interface VersionResult {
  version: string;
  commit?: string;
  repo?: string;
  system?: string;
  golang?: string;
  "interface-ipfs-core"?: string;
  "ipfs-http-client"?: string;
}

interface PingResult {
  success: boolean;
  time: number;
  text: string;
}

interface MountResult {
  fuseAllowOther?: boolean;
  ipfs?: string;
  ipns?: string;
}

interface IPFS extends RootAPI {
  bitswap: any;
  block: any;
  bootstrap: any;
  config: any;
  dag: any;
  dht: any;
  diag: any;
  files: any;
  key: any;
  log: any;
  name: any;
  object: any;
  pin: any;
  pubsub: any;
  refs: any;
  repo: any;
  stats: any;
  swarm: any;
  bases: any;
  codecs: any;
  hashers: any;
  headers?: Record<string, string>;
  searchParams?: URLSearchParams;
}

interface EndpointConfig {
  host: string;
  port: string;
  protocol: string;
  pathname: string;
  "api-path": string;
}

export interface IPFSHTTPClient extends IPFS {
  getEndpointConfig: () => EndpointConfig;
  headers?: Record<string, string>;
  searchParams?: URLSearchParams;
}
