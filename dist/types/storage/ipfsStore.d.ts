import { AsyncStore } from "./types";
export declare class IPFSSTORE<CID = any, IPFSCLIENT = any> implements AsyncStore<ArrayBuffer> {
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;
    cid: CID;
    directory: any;
    ipfsClient: any;
    constructor(cid: CID, ipfsClient: IPFSCLIENT);
    keys(): Promise<string[]>;
    getItem(item: string, opts?: RequestInit): Promise<any>;
    setItem(_item: string): Promise<boolean>;
    deleteItem(_item: string): Promise<boolean>;
    containsItem(_item: string): Promise<boolean>;
}
