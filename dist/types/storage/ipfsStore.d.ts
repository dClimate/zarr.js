import { AsyncStore } from "./types";
<<<<<<< HEAD
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
export declare class IPFSSTORE<CID = any> implements AsyncStore<ArrayBuffer> {
=======
export declare class IPFSSTORE<CID = any, IPFSELEMENTS = any> implements AsyncStore<ArrayBuffer> {
>>>>>>> master
    listDir?: undefined;
    rmDir?: undefined;
    getSize?: undefined;
    rename?: undefined;
    cid: CID;
    directory: any;
    ipfsElements: IPFSELEMENTS_INTERFACE;
    loader: any;
    hamt: boolean;
    key: string;
    constructor(cid: CID, ipfsElements: IPFSELEMENTS_INTERFACE);
    keys(): Promise<string[]>;
    getItem(item: string, opts?: RequestInit): Promise<any>;
    setItem(_item: string): Promise<boolean>;
    deleteItem(_item: string): Promise<boolean>;
    containsItem(_item: string): Promise<boolean>;
}
