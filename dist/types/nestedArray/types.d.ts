import { DtypeString } from '../types';
type Float16ArrayConstructor = typeof globalThis extends {
    Float16Array: infer T;
} ? T : never;
export type NestedArrayData = TypedArray | NDNestedArrayData;
export type NDNestedArrayData = TypedArray[] | TypedArray[][] | TypedArray[][][] | TypedArray[][][][] | TypedArray[][][][][] | TypedArray[][][][][][];
export type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array | InstanceType<Float16ArrayConstructor>;
export type TypedArrayConstructor<T extends TypedArray> = {
    new (): T;
    new (size: number): T;
    new (buffer: ArrayBuffer): T;
    BYTES_PER_ELEMENT: number;
};
export declare function getTypedArrayCtr(dtype: DtypeString): TypedArrayConstructor<TypedArray>;
export declare function getTypedArrayDtypeString(t: TypedArray): DtypeString;
export {};
