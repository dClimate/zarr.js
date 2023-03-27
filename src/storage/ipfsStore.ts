import { AsyncStore } from "./types";
import { KeyError } from "../errors";
import { load } from 'ipld-hashmap';
import { sha256 as blockHasher } from 'multiformats/hashes/sha2';
import * as blockCodec from '@ipld/dag-cbor'; // encode blocks using the DAG-CBOR format
import { concat as uint8ArrayConcat } from "uint8arrays/concat";
import { Zlib, Blosc } from "numcodecs";
import { CID } from 'multiformats/cid';
import { addCodec } from "../zarr-core";

import all from "it-all";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class IPFSSTORE<CID = any, IPFSCLIENT = any>
    implements AsyncStore<ArrayBuffer>
{
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;

    public cid: CID;
    public directory: any;
    public ipfsClient: any;
    public loader: any;
    public hamt: boolean;
    public key: string;

    constructor(cid: CID, ipfsClient: any) {
        this.cid = cid;
        this.hamt = false;
        this.ipfsClient = ipfsClient;
        this.key="";
        this.loader = {
            async get(cid: CID) {
                const bytes = await ipfsClient.block.get(cid, {
                    codec: "dag-cbor",
                });
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
        if (item === ".zarray") {
            const cid = this.cid;
            const value = await this.ipfsClient.dag.get(cid);
            if (value.status === 404) {
                // Item is not found
                throw new KeyError(item);
            } 
            if (!value.value) {
                throw new Error("Zarr does not exist at CID");
            } else {
                let jsonKey = "";
                // Find the location of the data being addressed. This is done by checking for an area with more than one dimension
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const [key, keyValue] of Object.entries(value.value[".zmetadata"].metadata)) {
                    try {
                        if (value.value[".zmetadata"].metadata[key]["_ARRAY_DIMENSIONS"].length >= 2) {
                            jsonKey = key.replace("/.zattrs", "");
                            this.key = jsonKey;
                        }
                    // eslint-disable-next-line no-empty
                    } catch (error) {}
                }
            // now check if using hamt
            if (value.value.hamt) {
                this.hamt = true;
                // if there is a hamt, load it
                const hamtOptions: any = { blockHasher, blockCodec };
                const hamt = await load(this.loader, CID.parse(value.value.hamt["/"]), hamtOptions);
                this.directory = hamt;
            } else {
                this.hamt = false;
                this.directory = value.value[jsonKey];
            }
               
            // Ensure a codec is loaded
            try {
                if (value.value[".zmetadata"].metadata[`${jsonKey}/.zarray`].compressor.id === "zlib") {
                    addCodec(Zlib.codecId, () => Zlib);
                }
                if (value.value[".zmetadata"].metadata[`${jsonKey}/.zarray`].compressor.id === "blosc") {
                    addCodec(Zlib.codecId, () => Blosc);
                } 
            // eslint-disable-next-line no-empty
            } catch (error) {}
                return value.value[".zmetadata"].metadata[`${jsonKey}/.zarray`];
            }
        } else {

            // example is tp/0.3.2
            if (this.hamt) {
                const location = await this.directory.get(`${this.key}/${item}`);
                console.log(location);
                if (location) {
                    const value = uint8ArrayConcat(
                        await all(this.ipfsClient.cat(location)),
                    );
                    return value.buffer;
                } else {
                    throw new KeyError(item);
                }
            }
            if (this.directory[item]) {
                const value = uint8ArrayConcat(
                    await all(this.ipfsClient.cat(this.directory[item])),
                );
                return value.buffer;
            }  else {
                throw new KeyError(item);
            }
        }
    }

    setItem(_item: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    deleteItem(_item: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    async containsItem(_item: string): Promise<boolean> {
        const value = await this.ipfsClient.dag.get(this.cid);
        if (value) {
            return true;
        }
        return false;
    }
}