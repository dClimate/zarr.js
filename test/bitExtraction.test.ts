import { extractBits } from '../src/storage/ipfsStore';

describe('extractBits', () => {
    test('extracts correct bits from single byte inputs', () => {
        expect(extractBits([0b11111111], 0, 5)).toBe(0b11111);
        expect(extractBits([0b10101010], 0, 5)).toBe(0b10101);
        expect(extractBits([0b10000000], 0, 5)).toBe(0b10000);
        expect(extractBits([0b00010000], 0, 5)).toBe(0b00010);
    });

    test('extracts correct bits from multi-byte inputs', () => {
        expect(extractBits([0b10000100, 0b10010000], 0, 9)).toBe(0b100001001);
        expect(extractBits([0b10101010, 0b10101010], 0, 9)).toBe(0b101010101);
        expect(extractBits([0b10000100, 0b10010000], 1, 5)).toBe(0b10010);
        expect(extractBits([0b10101010, 0b10101010], 1, 5)).toBe(0b01010);
        expect(extractBits([0b10000100, 0b10010000], 2, 5)).toBe(0b01000);
        expect(extractBits([0b10101010, 0b10101010], 2, 5)).toBe(0b10101);
    });

    test('extracts correct bits from longer multi-byte inputs', () => {
        expect(extractBits([0b10000100, 0b10010000, 0b10000100, 0b10000100], 3, 5))
            .toBe(0b01000);
        expect(extractBits([0b10101010, 0b10101010, 0b10101010, 0b10101010], 3, 5))
            .toBe(0b01010);
        expect(extractBits([0b10000100, 0b10010000, 0b10000100, 0b10000100], 4, 5))
            .toBe(0b01001);
        expect(extractBits([0b10101010, 0b10101010, 0b10101010, 0b10101010], 4, 5))
            .toBe(0b10101);
    });

    test('throws an error when extracting more bits than available', () => {
        expect(() => extractBits([0b1], 20, 20))
            .toThrowError(new Error("Arguments extract more bits than remain in the hash bits"));
    });
});