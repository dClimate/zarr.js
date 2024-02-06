import { AsyncStore } from "./types";
export declare class IPFSSTORE<CID = any, IPFSELEMENTS = any> implements AsyncStore<ArrayBuffer> {
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;
    cid: CID;
    directory: any;
    ipfsElements: any;
    constructor(cid: CID, ipfsElements: IPFSELEMENTS);
    keys(): Promise<string[]>;
    getItem(item: string, opts?: RequestInit): Promise<any>;
    setItem(_item: string): Promise<boolean>;
    deleteItem(_item: string): Promise<boolean>;
    containsItem(_item: string): Promise<boolean>;
}
