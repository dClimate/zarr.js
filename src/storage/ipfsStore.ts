import { ValidStoreType, AsyncStore } from './types';
import { IS_NODE, resolveUrl } from '../util';
import { KeyError, HTTPError } from '../errors';
import { concat as uint8ArrayConcat } from "uint8arrays/concat";

import all from 'it-all';





// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class IPFSSTORE<CID=any, IPFSCLIENT=any > implements AsyncStore<ArrayBuffer> {
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;

    public cid: CID;
    public directory: any;
    public ipfsClient: any;

    constructor(cid: CID,  ipfsClient: IPFSCLIENT) {
        this.cid = cid;
        this.ipfsClient = ipfsClient;
    }

    keys(): Promise<string[]> {
        throw new Error('Method not implemented.');
    }

    async getItem(item: string, opts?: RequestInit) {
        // rebuild the tree
        if (item === ".zarray") {
            const cid = this.cid;
            const value = await this.ipfsClient.dag.get(cid);
            if (!value.value) {
                throw new Error('Zarr does not exist at CID');
            } else {
                let combinedTree = {};
                for (const [key, keyValue] of Object.entries(value.value)) {
                    for (const [secondKey, secondKeyValue] of Object.entries(value.value[key])) {
                        if (secondKey.includes("/")) {
                            const newCID = value.value[key][secondKey];
                            const branch = await this.ipfsClient.dag.get(newCID);
                            // combinedTree = {...combinedTree, ...branch};
                            combinedTree = Object.assign(combinedTree,branch.value);
                            var size = Object.keys(combinedTree).length;
                            console.log("fetching");
                        };
                        
                      }
                  }
                  this.directory = combinedTree;
                return value.value[".zmetadata"].metadata["tp/.zarray"];
            }
        } else {
            console.log(item);
            console.log(this.directory[item]);
            if (this.directory[item]) {
                const value = uint8ArrayConcat(await all(this.ipfsClient.cat(this.directory[item])));
                // console.log(value);
                // const floatArray = new Float32Array(value.buffer);
                // console.log(value.buffer);
                return value.buffer;
            } else {
                throw new KeyError(item);
            }

        }

        // if (value.status === 404) {
        //     // Item is not found
        //     throw new KeyError(item);
        // } else if (value.status !== 200) {
        //     throw new HTTPError(String(value.status));
        // }

        // only decode if 200
        // if (IS_NODE) {
        //     return Buffer.from(await value.arrayBuffer());
        // } else {
        //     return value.arrayBuffer(); // Browser
        // }
    }

    setItem(_item: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    deleteItem(_item: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    async containsItem(_item: string): Promise<boolean> {
        const value = await this.ipfsClient.dag.get(this.cid);
        if (value) {
            return true;
        }
    }
}
