import { AsyncStore } from "./types";
import { KeyError } from "../errors";
import { concat as uint8ArrayConcat } from "uint8arrays/concat";
import { Zlib, Blosc } from "numcodecs";
import { addCodec } from "../zarr-core";

import all from "it-all";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class IPFSSTORE<CID = any, IPFSELEMENTS = any>
    implements AsyncStore<ArrayBuffer>
{
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;

    public cid: CID;
    public directory: any;
    public ipfsElements: any;

    constructor(cid: CID, ipfsElements: IPFSELEMENTS) {
        this.cid = cid;
        this.ipfsElements = ipfsElements;
    }

    keys(): Promise<string[]> {
        throw new Error("Method not implemented.");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getItem(item: string, opts?: RequestInit) {
        if (item === ".zarray") {
            const cid = this.cid;
            const dagCbor = this.ipfsElements.dagCbor;
            const value: any = await dagCbor.get(cid);
            if (value.status === 404) {
                // Item is not found
                throw new KeyError(item);
            } 
            if (!value[".zmetadata"]) {
                throw new Error("Zarr does not exist at CID");
            } else {
                let jsonKey = "";
                let combinedTree = {};
                // Find the location of the data being addressed. This is done by checking for an area with more than one dimension
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const [key, keyValue] of Object.entries(value[".zmetadata"].metadata)) {
                    try {
                        if (value[".zmetadata"].metadata[key]["_ARRAY_DIMENSIONS"]?.length >= 2) {
                            jsonKey = key.replace("/.zattrs", "");
                        }
                    // eslint-disable-next-line no-empty
                    } catch (error) {console.log("error", error);}
                }
                // To rebuild the tree we assume the data is found 
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const [secondKey, secondKeyValue] of Object.entries(
                    value[jsonKey],
                )) {
                    // If a tree exists we denominate the start of the object with a "/"
                    if (secondKey.includes("/")) {
                        const newCID = value[jsonKey][secondKey];
                        const branch = await dagCbor.get(
                            newCID,
                        );
                        combinedTree = Object.assign(
                            combinedTree,
                            branch,
                        );
                    // If an object does not have it and is not the ".zarray" or ".zattrs" then no tree exists
                    } else if (secondKey !== ".zarray" && secondKey !== ".zattrs") {
                        // assign to directory for later returns
                        this.directory = value[jsonKey];
                        // Ensure a codec is loaded
                        try {
                            if (value[".zmetadata"].metadata[`${jsonKey}/.zarray`].compressor?.id === "zlib") {
                                addCodec(Zlib.codecId, () => Zlib);
                            }
                            if (value[".zmetadata"].metadata[`${jsonKey}/.zarray`].compressor?.id === "blosc") {
                                addCodec(Zlib.codecId, () => Blosc);
                            } 
                        // eslint-disable-next-line no-empty
                        } catch (error) {console.log("error", error);}
                        return value[".zmetadata"].metadata[`${jsonKey}/.zarray`];
                    }
                }
                // after the tree has been rebuilt, assign to the directory for parsing later
                this.directory = combinedTree;         
                // Ensure a codec is loaded
                try {
                    if (value[".zmetadata"].metadata[`${jsonKey}/.zarray`].compressor.id === "zlib") {
                        addCodec(Zlib.codecId, () => Zlib);
                    }
                    if (value[".zmetadata"].metadata[`${jsonKey}/.zarray`].compressor.id === "blosc") {
                        addCodec(Zlib.codecId, () => Blosc);
                    } 
                // eslint-disable-next-line no-empty
                } catch (error) {console.log("error", error);}
        
                return value[".zmetadata"].metadata[`${jsonKey}/.zarray`];
            }
        } else {
            if (this.directory && this.directory[item]) {
                const fs = this.ipfsElements.unixfs;
                const value = uint8ArrayConcat(
                    await all(fs.cat(this.directory[item])),
                );
                return value.buffer;
            } else {
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
        const dagCbor = this.ipfsElements.dagCbor;
        const value = await dagCbor.get(this.cid);
        if (value) {
            return true;
        }
        return false;
    }
}
