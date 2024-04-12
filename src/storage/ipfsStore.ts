import { AsyncStore } from "./types";
import { KeyError } from "../errors";
import { load } from 'ipld-hashmap';
import { sha256 as blockHasher } from 'multiformats/hashes/sha2';
import * as blockCodec from '@ipld/dag-cbor'; // encode blocks using the DAG-CBOR format
import { concat as uint8ArrayConcat } from "uint8arrays/concat";
import { Zlib, Blosc } from "numcodecs";
import { addCodec } from "../zarr-core";

import all from "it-all";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class IPFSSTORE<CID = any, IPFSELEMENTS = any> implements AsyncStore<ArrayBuffer>
{
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;

    public cid: CID;
    public directory: any;
    public ipfsElements: IPFSELEMENTS;
    public loader: any;
    public hamt: boolean;
    public key: string;

    constructor(cid: CID, ipfsElements: IPFSELEMENTS) {
        this.cid = cid;
        this.hamt = false;
        this.ipfsElements = ipfsElements;
        this.key="";
        this.loader = {
            async get(cid: CID) {
                const dagCbor =(ipfsElements as any).dagCbor;
                const bytes = await dagCbor.components.blockstore.get(cid);
                return bytes;
            },
            // For our purposes of reading the HashMap we don't need to implement put
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async put(cid: CID, bytes: ArrayBuffer) {
                return null;
            },
        };
    }

    keys(): Promise<string[]> {
        throw new Error("Method not implemented.");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getItem(item: string, opts?: RequestInit) {
        if (item === ".zgroup") {
            // Loading Group
            const { cid, ipfsElements } = this;
            const dagCbor = (ipfsElements as any).dagCbor;
            const response = await dagCbor.get(cid);
            if (response.status === 404) {
                // Item is not found
                throw new KeyError(item);
            }
            if (!response) {
                throw new Error("Zarr Group does not exist at CID");
            } else {
                return response[item];
            }
        }
        if (item.includes(".zarray")) {
            const { cid, ipfsElements } = this;
            const dagCbor = (ipfsElements as any).dagCbor;
            const response = await dagCbor.get(cid);
            if (response.status === 404) {
                throw new KeyError(item);
            }
            if (!response) {
                throw new Error("Zarr does not exist at CID");
            } else {
                const splitItems = item.split("/");
                // This is used to get the .zarray object
                // In the case of a nested array, we need to get the parent object
                // and so we have the directory in case it is not hamt
                let objectValue = response;
                let objectValueParent = response;
                for (let i = 0; i < splitItems.length; i += 1) {
                    if (splitItems[0] === ".zarray") {
                        objectValue = response[splitItems[i]];
                        break;
                    }
                    if (i > 0) {
                        objectValueParent =
                            objectValueParent[splitItems[i - 1]];
                    }
                    objectValue = objectValue[splitItems[i]];
                }
                // now check if using hamt
                if (response.hamt) {
                    this.hamt = true;
                    // if there is a hamt, load it
                    const hamtOptions = { blockHasher, blockCodec };
                    const hamt = await load(
                        this.loader,
                        response.hamt,
                        hamtOptions,
                    );
                    // the hamt will have the KV pair for all the zarr arrays in the group directory
                    // so we can use it to get the CID for the array
                    this.directory = hamt;
                } else {
                    this.hamt = false;
                    this.directory = objectValueParent;
                }
                // Ensure a codec is loaded
                try {
                    if (
                        response[".zmetadata"].metadata[item].compressor.id === "zlib"
                    ) {
                        addCodec(Zlib.codecId, () => Zlib);
                    }
                    if (
                        response[".zmetadata"].metadata[item].compressor.id === "blosc"
                    ) {
                        addCodec(Zlib.codecId, () => Blosc);
                    }
                    // eslint-disable-next-line no-empty
                } catch (error) {}
                return objectValue;
            }
        } else {
            const fs = (this.ipfsElements as any).unixfs;
            if (this.hamt) {
                const location = await this.directory.get(item);
                if (location) {
                    const response = uint8ArrayConcat(
                        await all(fs.cat(location)),
                    );
                    return response.buffer;
                }
                throw new KeyError(item);
            }
            if (this.directory[item]) {
                const value = uint8ArrayConcat(
                    await all(fs.cat(this.directory[item])),
                );
                return value.buffer;
            }
            throw new KeyError(item);
        }
    }

    setItem(_item: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    deleteItem(_item: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    async containsItem(_item: string): Promise<boolean> {
        const dagCbor = (this.ipfsElements as any).dagCbor;
        const response = await dagCbor.get(this.cid);
        const splitItems = _item.split("/");
        let objectValue = response;
        for (let i = 0; i < splitItems.length; i += 1) {
            if (splitItems[i] === ".zarray" || splitItems[i] === ".zgroup") {
                if (objectValue[splitItems[i]]) {
                    return true;
                }
            }
            objectValue = objectValue[splitItems[i]];
        }
        return false;
    }
}