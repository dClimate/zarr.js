import { AsyncStore } from "./types";
import { NestedArray, TypedArray } from "../zarr-core";
import { hasher } from 'multiformats';
export declare function extractBits(hashBytes: Uint8Array, depth: number, nbits: number): number;
export interface DECRYPTION_ITEMS_INTERFACE {
    sodiumLibrary: any;
    key: string;
    header: string;
}
export interface IPFSELEMENTS_INTERFACE {
    dagCbor: any;
    unixfs: any;
    decryptionItems?: DECRYPTION_ITEMS_INTERFACE;
}
export declare const blake3: hasher.Hasher<"blake3", 30>;
export declare class IPFSStore<CID = any> implements AsyncStore<ArrayBuffer> {
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;
    cid: CID;
    ipfsElements: IPFSELEMENTS_INTERFACE;
    private rootNode;
    private cache;
    private readonly maxCacheSize;
    constructor(cid: CID, ipfsElements: IPFSELEMENTS_INTERFACE);
    private hashFn;
    private writeNode;
    private readNode;
    private maintainCacheSize;
    keys(): Promise<string[]>;
    getMetadata(metadataInput?: string): Promise<Record<string, any>>;
    getBounds(): Promise<{
        latMin: number | NestedArray<TypedArray>;
        latMax: number | NestedArray<TypedArray>;
        lonMin: number | NestedArray<TypedArray>;
        lonMax: number | NestedArray<TypedArray>;
        timeMin: string;
        timeMax: string;
        spatialResolution: number;
        temporalResolution: string;
    }>;
    _findCIDInNode(item: string): Promise<string>;
    _findItemInNode(item: string): Promise<Uint8Array>;
    getItem(item: string): Promise<any>;
    setItem(_item: string): Promise<boolean>;
    deleteItem(_item: string): Promise<boolean>;
    containsItem(item: string): Promise<boolean>;
}
