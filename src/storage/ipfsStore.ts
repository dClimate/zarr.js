import { AsyncStore } from "./types";
import { KeyError } from "../errors";
import * as blockCodec from '@ipld/dag-cbor';
import { concat as uint8ArrayConcat } from "uint8arrays/concat";
import { Zlib, Blosc } from "numcodecs";
import { addCodec, NestedArray, openArray, TypedArray } from "../zarr-core";
import all from "it-all";
import { blake3 as b3 } from '@noble/hashes/blake3';
import { hasher } from 'multiformats';

// Node class for HAMT implementation
class Node {
    data: {
        B: { [key: string]: Array<{ [key: string]: any }> };
        L: { [key: string]: any };
    };

    constructor() {
        this.data = {
            B: {}, // Buckets
            L: {}  // Links
        };
    }

    getBuckets() {
        return this.data.B;
    }

    getLinks() {
        return this.data.L;
    }

    replaceLink(oldLink: any, newLink: any) {
        const links = this.getLinks();
        for (const strKey of Object.keys(links)) {
            if (links[strKey] === oldLink) {
                links[strKey] = newLink;
            }
        }
    }

    removeLink(oldLink: any) {
        const links = this.getLinks();
        for (const strKey of Object.keys(links)) {
            if (links[strKey] === oldLink) {
                delete links[strKey];
            }
        }
    }

    serialize(): Uint8Array {
        return blockCodec.encode(this.data);
    }

    static deserialize(data: Uint8Array): Node {
        try {
            const decoded = blockCodec.decode(data);
            if (decoded && typeof decoded === 'object' && 'B' in decoded && 'L' in decoded) {
                const node = new Node();
                node.data = decoded as { B: { [key: string]: { [key: string]: any }[] }; L: { [key: string]: any } };
                return node;
            }
            throw new Error("Invalid node data structure");
        } catch {
            throw new Error("Invalid dag-cbor encoded data");
        }
    }
}

// Helper function to extract bits
export function extractBits(hashBytes: Uint8Array, depth: number, nbits: number): number {
    const hashBitLength = hashBytes.length * 8;
    const startBitIndex = depth * nbits;

    if (hashBitLength - startBitIndex < nbits) {
        throw new Error("Arguments extract more bits than remain in the hash bits");
    }

    // Ensure bit shift is within safe range
    if (hashBitLength - startBitIndex <= 0) {
        throw new Error("Invalid bit extraction range");
    }

    // Use BigInt for safe shifting
    const mask = (BigInt(1) << BigInt(hashBitLength - startBitIndex)) - BigInt(1);

    if (mask === BigInt(0)) {
        throw new Error("Invalid mask value: 0");
    }

    // Equivalent of Python's int.bit_length()
    const nChopOffAtEnd = mask.toString(2).length - nbits;

    // Convert bytes to BigInt
    let hashAsInt = BigInt(0);
    for (let i = 0; i < hashBytes.length; i++) {
        hashAsInt = (hashAsInt << BigInt(8)) | BigInt(hashBytes[i]);
    }

    // Extract bits
    const result = Number((mask & hashAsInt) >> BigInt(nChopOffAtEnd));
    return result;
}

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

export const blake3 = hasher.from({
    name: 'blake3',
    code: 0x1e,
    encode: (input) => b3(input),
  });

export class IPFSStore<CID = any> implements AsyncStore<ArrayBuffer> {
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;

    public cid: CID;
    public ipfsElements: IPFSELEMENTS_INTERFACE;
    private rootNode: Node;
    // private maxBucketSize: number = 4;
    private cache: Map<string, Node> = new Map();
    private readonly maxCacheSize: number = 10_000_000; // 10MB

    constructor(cid: CID, ipfsElements: IPFSELEMENTS_INTERFACE) {
        this.cid = cid;
        this.ipfsElements = ipfsElements;
        this.rootNode = new Node();
    }

    private async hashFn(input: string): Promise<Uint8Array> {
        const encoder = new TextEncoder();
        const hashBytes = encoder.encode(input);
        return blake3.encode(hashBytes);
    }

    private async writeNode(node: Node): Promise<any> {
        const serialized = node.serialize();
        const cid = await this.ipfsElements.dagCbor.components.blockstore.put(serialized);
        this.cache.set(cid.toString(), node);
        this.maintainCacheSize();
        return cid;
    }

    private async readNode(nodeId: any): Promise<Node> {
        const cidStr = nodeId.toString();
        if (this.cache.has(cidStr)) {
            return this.cache.get(cidStr)!;
        }
        
        const bytes = await this.ipfsElements.dagCbor.components.blockstore.get(nodeId);
        const node = Node.deserialize(bytes);
        this.cache.set(cidStr, node);
        this.maintainCacheSize();
        return node;
    }

    private maintainCacheSize(): void {
        // Simple LRU-like cache maintenance
        if (this.cache.size > this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            // check if the key is not undefined
            if (firstKey)
            {
                this.cache.delete(firstKey);
            }
            
        }
    }

    async keys(): Promise<string[]> {
        throw new Error("Method not implemented.");
    }

    // Json metadata
    async getMetadata(metadataInput = ".zmetadata"): Promise<Record<string, any>> {
        const metadata: Uint8Array = await this._findItemInNode(metadataInput);
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(metadata);
        return JSON.parse(jsonString);
    }

    async getBounds(): Promise<{ latMin: number | NestedArray<TypedArray>; latMax: number | NestedArray<TypedArray>; lonMin: number | NestedArray<TypedArray>; lonMax: number | NestedArray<TypedArray>; timeMin: string; timeMax: string; spatialResolution: number; temporalResolution: string }> {
        // Fetch metadata
        const metadata = await this.getMetadata();
        const attributes = metadata.metadata[".zattrs"];

        // Check if bbox on .zattrs and use that first
        if ("bbox" in attributes) {
            const [lonMin, latMin, lonMax, latMax] = attributes["bbox"];
            const dateStrings = attributes["date_range"];
            const spatialResolution = attributes["spatial_resolution"];
            const temporalResolution = attributes["temporal_resolution"];
            const boundingDatesArray: Date[] = dateStrings.map((dateString: string) => {
                const year = Number(dateString.slice(0, 4));
                const month = Number(dateString.slice(4, 6)) - 1; // Months are 0-indexed in JavaScript
                const day = Number(dateString.slice(6, 8));
                const hour = Number(dateString.slice(8, 10));
                return new Date(year, month, day, hour);
            });
            return { latMin, latMax, lonMin, lonMax, timeMin: boundingDatesArray[0].toISOString(), timeMax: boundingDatesArray[1].toISOString(), spatialResolution, temporalResolution };
        }
        
        // Check if lat/.zarray or latitude/.zarray is used and store value
        const latKey = metadata.metadata["latitude/.zarray"] ? "latitude" : "lat";
        const lonKey = metadata.metadata["longitude/.zarray"] ? "longitude" : "lon";
        const timeAttrs = metadata.metadata["time/.zattrs"];
    
        // Open latitude array
        const zLat = await openArray({
            store: "ipfs",
            path: latKey,
            mode: "r",
            cid: this.cid,
            ipfsElements: this.ipfsElements,
        });
        
        // Get chunk size and min/max latitude
        const latChunkSize = zLat.meta.chunks[0];
        const latMin = await zLat.get([0]);
        const latMax = await zLat.get([latChunkSize - 1]);
    
        // Open longitude array
        const zLon = await openArray({
            store: "ipfs",
            path: lonKey,
            mode: "r",
            cid: this.cid,
            ipfsElements: this.ipfsElements,
        });
        
        // Get chunk size and min/max longitude
        const lonChunkSize = zLon.meta.chunks[0];
        const lonMin: any = await zLon.get([0]);
        const lonMax: any = await zLon.get([lonChunkSize - 1]);

        // calculate spatial resolution
        const spatialResolution = Math.abs(lonMax - lonMin) / lonChunkSize;

    
        // Extract time attributes
        const timeUnits = timeAttrs.units; // e.g., "days since 1980-01-01"
        const [unit, referenceDate] = timeUnits.split(" since ");
        
        // Convert time values based on units
        let timeMin = "";
        let timeMax = "";
        let temporalResolution = "";
        if (unit === "days" || unit === "hours" || unit === "months") {
            const timeChunk = metadata.metadata["time/.zarray"].chunks[0];
            if (timeChunk) {
                const minTimeValue = 0;
                const maxTimeValue = timeChunk - 1;
                
                // Construct ISO date strings based on reference date
                const reference = new Date(referenceDate);
                if (unit === "days") {
                    temporalResolution = "daily";
                    timeMin = new Date(reference.getTime() + minTimeValue * 86400000).toISOString();
                    timeMax = new Date(reference.getTime() + maxTimeValue * 86400000).toISOString();
                } else if (unit === "hours") {
                    temporalResolution = "hourly";
                    timeMin = new Date(reference.getTime() + minTimeValue * 1000).toISOString();
                    timeMax = new Date(reference.getTime() + maxTimeValue * 1000).toISOString();
                } else if (unit === "months") {
                    temporalResolution = "monthly";
                    const minDate = new Date(reference);
                    minDate.setMonth(minDate.getMonth() + minTimeValue);
                    timeMin = minDate.toISOString();

                    const maxDate = new Date(reference);
                    maxDate.setMonth(maxDate.getMonth() + maxTimeValue);
                    timeMax = maxDate.toISOString();
                }
            } else {
                throw new Error("Time metadata missing");
            }
        } else {
            throw new Error(`Unsupported time unit: ${unit}`);
        }

        return { latMin, latMax, lonMin, lonMax, timeMin, timeMax, spatialResolution, temporalResolution };
    }
    
    async _findCIDInNode(item: string): Promise<string> {
        const hash = await this.hashFn(item);
        let currentNodeId = this.cid;
        let depth = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const node = await this.readNode(currentNodeId);
            const mapKey = extractBits(hash, depth, 8).toString();
            const buckets = node.getBuckets();
            const links = node.getLinks();


            if (mapKey in buckets) {
                const bucket = buckets[mapKey];
                for (const kv of bucket) {
                    if (item in kv) {
                        return kv[item];
                    }
                }
                throw new KeyError(item);
            }

            if (mapKey in links) {
                currentNodeId = links[mapKey];
                depth++;
                continue;
            }

            throw new KeyError(item);
        }
    }

    async _findItemInNode(item: string): Promise<Uint8Array> {
        const hash = await this.hashFn(item);
        let currentNodeId = this.cid;
        let depth = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const node = await this.readNode(currentNodeId);
            const mapKey = extractBits(hash, depth, 8).toString();
            const buckets = node.getBuckets();
            const links = node.getLinks();
            if (mapKey in buckets) {
                const bucket = buckets[mapKey];
                for (const kv of bucket) {
                    if (item in kv) {
                        const value = uint8ArrayConcat(
                            await all(this.ipfsElements.unixfs.cat(kv[item]))
                        );

                        const decoded: ArrayBuffer = blockCodec.decode(value);
                        const uint8Array = new Uint8Array(decoded);

                        return uint8Array;
                    }
                }
                throw new KeyError(item);
            }

            if (mapKey in links) {
                currentNodeId = links[mapKey];
                depth++;
                continue;
            }

            throw new KeyError(item);
        }
    }

    async getItem(item: string): Promise<any> {
        if (item === ".zgroup" || item.includes(".zarray")) {
            const response = await this.getMetadata(item);   
            if (!response) {
                throw new KeyError(item);
            }
            const compressorId = response.compressor.id;
            if (compressorId === "zlib") {
                addCodec(Zlib.codecId, () => Zlib);
            } else if (compressorId === "blosc") {
                addCodec(Blosc.codecId, () => Blosc);
            }
            // const response = await thi
            // Decode

            return response;
        }
        const data = await this._findItemInNode(item);
        return data;
    }

    async setItem(_item: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    async deleteItem(_item: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    async containsItem(item: string): Promise<boolean> {
        try {
            await this.getItem(item);
            return true;
        } catch (e) {
            if (e instanceof KeyError) {
                return false;
            }
            throw e;
        }
    }
}