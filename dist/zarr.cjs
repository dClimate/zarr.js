'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/*! pako 2.0.3 https://github.com/nodeca/pako @license (MIT AND Zlib) */
// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

/* eslint-disable space-unary-ops */

/* Public constants ==========================================================*/
/* ===========================================================================*/


//const Z_FILTERED          = 1;
//const Z_HUFFMAN_ONLY      = 2;
//const Z_RLE               = 3;
const Z_FIXED               = 4;
//const Z_DEFAULT_STRATEGY  = 0;

/* Possible values of the data_type field (though see inflate()) */
const Z_BINARY              = 0;
const Z_TEXT                = 1;
//const Z_ASCII             = 1; // = Z_TEXT
const Z_UNKNOWN             = 2;

/*============================================================================*/


function zero(buf) { let len = buf.length; while (--len >= 0) { buf[len] = 0; } }

// From zutil.h

const STORED_BLOCK = 0;
const STATIC_TREES = 1;
const DYN_TREES    = 2;
/* The three kinds of block type */

const MIN_MATCH    = 3;
const MAX_MATCH    = 258;
/* The minimum and maximum match lengths */

// From deflate.h
/* ===========================================================================
 * Internal compression state.
 */

const LENGTH_CODES  = 29;
/* number of length codes, not counting the special END_BLOCK code */

const LITERALS      = 256;
/* number of literal bytes 0..255 */

const L_CODES       = LITERALS + 1 + LENGTH_CODES;
/* number of Literal or Length codes, including the END_BLOCK code */

const D_CODES       = 30;
/* number of distance codes */

const BL_CODES      = 19;
/* number of codes used to transfer the bit lengths */

const HEAP_SIZE     = 2 * L_CODES + 1;
/* maximum heap size */

const MAX_BITS      = 15;
/* All codes must not exceed MAX_BITS bits */

const Buf_size      = 16;
/* size of bit buffer in bi_buf */


/* ===========================================================================
 * Constants
 */

const MAX_BL_BITS = 7;
/* Bit length codes must not exceed MAX_BL_BITS bits */

const END_BLOCK   = 256;
/* end of block literal code */

const REP_3_6     = 16;
/* repeat previous bit length 3-6 times (2 bits of repeat count) */

const REPZ_3_10   = 17;
/* repeat a zero length 3-10 times  (3 bits of repeat count) */

const REPZ_11_138 = 18;
/* repeat a zero length 11-138 times  (7 bits of repeat count) */

/* eslint-disable comma-spacing,array-bracket-spacing */
const extra_lbits =   /* extra bits for each length code */
  new Uint8Array([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]);

const extra_dbits =   /* extra bits for each distance code */
  new Uint8Array([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]);

const extra_blbits =  /* extra bits for each bit length code */
  new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7]);

const bl_order =
  new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);
/* eslint-enable comma-spacing,array-bracket-spacing */

/* The lengths of the bit length codes are sent in order of decreasing
 * probability, to avoid transmitting the lengths for unused bit length codes.
 */

/* ===========================================================================
 * Local data. These are initialized only once.
 */

// We pre-fill arrays with 0 to avoid uninitialized gaps

const DIST_CODE_LEN = 512; /* see definition of array dist_code below */

// !!!! Use flat array instead of structure, Freq = i*2, Len = i*2+1
const static_ltree  = new Array((L_CODES + 2) * 2);
zero(static_ltree);
/* The static literal tree. Since the bit lengths are imposed, there is no
 * need for the L_CODES extra codes used during heap construction. However
 * The codes 286 and 287 are needed to build a canonical tree (see _tr_init
 * below).
 */

const static_dtree  = new Array(D_CODES * 2);
zero(static_dtree);
/* The static distance tree. (Actually a trivial tree since all codes use
 * 5 bits.)
 */

const _dist_code    = new Array(DIST_CODE_LEN);
zero(_dist_code);
/* Distance codes. The first 256 values correspond to the distances
 * 3 .. 258, the last 256 values correspond to the top 8 bits of
 * the 15 bit distances.
 */

const _length_code  = new Array(MAX_MATCH - MIN_MATCH + 1);
zero(_length_code);
/* length code for each normalized match length (0 == MIN_MATCH) */

const base_length   = new Array(LENGTH_CODES);
zero(base_length);
/* First normalized length for each code (0 = MIN_MATCH) */

const base_dist     = new Array(D_CODES);
zero(base_dist);
/* First normalized distance for each code (0 = distance of 1) */


function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {

  this.static_tree  = static_tree;  /* static tree or NULL */
  this.extra_bits   = extra_bits;   /* extra bits for each code or NULL */
  this.extra_base   = extra_base;   /* base index for extra_bits */
  this.elems        = elems;        /* max number of elements in the tree */
  this.max_length   = max_length;   /* max bit length for the codes */

  // show if `static_tree` has data or dummy - needed for monomorphic objects
  this.has_stree    = static_tree && static_tree.length;
}


let static_l_desc;
let static_d_desc;
let static_bl_desc;


function TreeDesc(dyn_tree, stat_desc) {
  this.dyn_tree = dyn_tree;     /* the dynamic tree */
  this.max_code = 0;            /* largest code with non zero frequency */
  this.stat_desc = stat_desc;   /* the corresponding static tree */
}



const d_code = (dist) => {

  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
};


/* ===========================================================================
 * Output a short LSB first on the stream.
 * IN assertion: there is enough room in pendingBuf.
 */
const put_short = (s, w) => {
//    put_byte(s, (uch)((w) & 0xff));
//    put_byte(s, (uch)((ush)(w) >> 8));
  s.pending_buf[s.pending++] = (w) & 0xff;
  s.pending_buf[s.pending++] = (w >>> 8) & 0xff;
};


/* ===========================================================================
 * Send a value on a given number of bits.
 * IN assertion: length <= 16 and value fits in length bits.
 */
const send_bits = (s, value, length) => {

  if (s.bi_valid > (Buf_size - length)) {
    s.bi_buf |= (value << s.bi_valid) & 0xffff;
    put_short(s, s.bi_buf);
    s.bi_buf = value >> (Buf_size - s.bi_valid);
    s.bi_valid += length - Buf_size;
  } else {
    s.bi_buf |= (value << s.bi_valid) & 0xffff;
    s.bi_valid += length;
  }
};


const send_code = (s, c, tree) => {

  send_bits(s, tree[c * 2]/*.Code*/, tree[c * 2 + 1]/*.Len*/);
};


/* ===========================================================================
 * Reverse the first len bits of a code, using straightforward code (a faster
 * method would use a table)
 * IN assertion: 1 <= len <= 15
 */
const bi_reverse = (code, len) => {

  let res = 0;
  do {
    res |= code & 1;
    code >>>= 1;
    res <<= 1;
  } while (--len > 0);
  return res >>> 1;
};


/* ===========================================================================
 * Flush the bit buffer, keeping at most 7 bits in it.
 */
const bi_flush = (s) => {

  if (s.bi_valid === 16) {
    put_short(s, s.bi_buf);
    s.bi_buf = 0;
    s.bi_valid = 0;

  } else if (s.bi_valid >= 8) {
    s.pending_buf[s.pending++] = s.bi_buf & 0xff;
    s.bi_buf >>= 8;
    s.bi_valid -= 8;
  }
};


/* ===========================================================================
 * Compute the optimal bit lengths for a tree and update the total bit length
 * for the current block.
 * IN assertion: the fields freq and dad are set, heap[heap_max] and
 *    above are the tree nodes sorted by increasing frequency.
 * OUT assertions: the field len is set to the optimal bit length, the
 *     array bl_count contains the frequencies for each bit length.
 *     The length opt_len is updated; static_len is also updated if stree is
 *     not null.
 */
const gen_bitlen = (s, desc) =>
//    deflate_state *s;
//    tree_desc *desc;    /* the tree descriptor */
{
  const tree            = desc.dyn_tree;
  const max_code        = desc.max_code;
  const stree           = desc.stat_desc.static_tree;
  const has_stree       = desc.stat_desc.has_stree;
  const extra           = desc.stat_desc.extra_bits;
  const base            = desc.stat_desc.extra_base;
  const max_length      = desc.stat_desc.max_length;
  let h;              /* heap index */
  let n, m;           /* iterate over the tree elements */
  let bits;           /* bit length */
  let xbits;          /* extra bits */
  let f;              /* frequency */
  let overflow = 0;   /* number of elements with bit length too large */

  for (bits = 0; bits <= MAX_BITS; bits++) {
    s.bl_count[bits] = 0;
  }

  /* In a first pass, compute the optimal bit lengths (which may
   * overflow in the case of the bit length tree).
   */
  tree[s.heap[s.heap_max] * 2 + 1]/*.Len*/ = 0; /* root of the heap */

  for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
    n = s.heap[h];
    bits = tree[tree[n * 2 + 1]/*.Dad*/ * 2 + 1]/*.Len*/ + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n * 2 + 1]/*.Len*/ = bits;
    /* We overwrite tree[n].Dad which is no longer needed */

    if (n > max_code) { continue; } /* not a leaf node */

    s.bl_count[bits]++;
    xbits = 0;
    if (n >= base) {
      xbits = extra[n - base];
    }
    f = tree[n * 2]/*.Freq*/;
    s.opt_len += f * (bits + xbits);
    if (has_stree) {
      s.static_len += f * (stree[n * 2 + 1]/*.Len*/ + xbits);
    }
  }
  if (overflow === 0) { return; }

  // Trace((stderr,"\nbit length overflow\n"));
  /* This happens for example on obj2 and pic of the Calgary corpus */

  /* Find the first bit length which could increase: */
  do {
    bits = max_length - 1;
    while (s.bl_count[bits] === 0) { bits--; }
    s.bl_count[bits]--;      /* move one leaf down the tree */
    s.bl_count[bits + 1] += 2; /* move one overflow item as its brother */
    s.bl_count[max_length]--;
    /* The brother of the overflow item also moves one step up,
     * but this does not affect bl_count[max_length]
     */
    overflow -= 2;
  } while (overflow > 0);

  /* Now recompute all bit lengths, scanning in increasing frequency.
   * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
   * lengths instead of fixing only the wrong ones. This idea is taken
   * from 'ar' written by Haruhiko Okumura.)
   */
  for (bits = max_length; bits !== 0; bits--) {
    n = s.bl_count[bits];
    while (n !== 0) {
      m = s.heap[--h];
      if (m > max_code) { continue; }
      if (tree[m * 2 + 1]/*.Len*/ !== bits) {
        // Trace((stderr,"code %d bits %d->%d\n", m, tree[m].Len, bits));
        s.opt_len += (bits - tree[m * 2 + 1]/*.Len*/) * tree[m * 2]/*.Freq*/;
        tree[m * 2 + 1]/*.Len*/ = bits;
      }
      n--;
    }
  }
};


/* ===========================================================================
 * Generate the codes for a given tree and bit counts (which need not be
 * optimal).
 * IN assertion: the array bl_count contains the bit length statistics for
 * the given tree and the field len is set for all tree elements.
 * OUT assertion: the field code is set for all tree elements of non
 *     zero code length.
 */
const gen_codes = (tree, max_code, bl_count) =>
//    ct_data *tree;             /* the tree to decorate */
//    int max_code;              /* largest code with non zero frequency */
//    ushf *bl_count;            /* number of codes at each bit length */
{
  const next_code = new Array(MAX_BITS + 1); /* next code value for each bit length */
  let code = 0;              /* running code value */
  let bits;                  /* bit index */
  let n;                     /* code index */

  /* The distribution counts are first used to generate the code values
   * without bit reversal.
   */
  for (bits = 1; bits <= MAX_BITS; bits++) {
    next_code[bits] = code = (code + bl_count[bits - 1]) << 1;
  }
  /* Check that the bit counts in bl_count are consistent. The last code
   * must be all ones.
   */
  //Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
  //        "inconsistent bit counts");
  //Tracev((stderr,"\ngen_codes: max_code %d ", max_code));

  for (n = 0;  n <= max_code; n++) {
    let len = tree[n * 2 + 1]/*.Len*/;
    if (len === 0) { continue; }
    /* Now reverse the bits */
    tree[n * 2]/*.Code*/ = bi_reverse(next_code[len]++, len);

    //Tracecv(tree != static_ltree, (stderr,"\nn %3d %c l %2d c %4x (%x) ",
    //     n, (isgraph(n) ? n : ' '), len, tree[n].Code, next_code[len]-1));
  }
};


/* ===========================================================================
 * Initialize the various 'constant' tables.
 */
const tr_static_init = () => {

  let n;        /* iterates over tree elements */
  let bits;     /* bit counter */
  let length;   /* length value */
  let code;     /* code value */
  let dist;     /* distance index */
  const bl_count = new Array(MAX_BITS + 1);
  /* number of codes at each bit length for an optimal tree */

  // do check in _tr_init()
  //if (static_init_done) return;

  /* For some embedded targets, global variables are not initialized: */
/*#ifdef NO_INIT_GLOBAL_POINTERS
  static_l_desc.static_tree = static_ltree;
  static_l_desc.extra_bits = extra_lbits;
  static_d_desc.static_tree = static_dtree;
  static_d_desc.extra_bits = extra_dbits;
  static_bl_desc.extra_bits = extra_blbits;
#endif*/

  /* Initialize the mapping length (0..255) -> length code (0..28) */
  length = 0;
  for (code = 0; code < LENGTH_CODES - 1; code++) {
    base_length[code] = length;
    for (n = 0; n < (1 << extra_lbits[code]); n++) {
      _length_code[length++] = code;
    }
  }
  //Assert (length == 256, "tr_static_init: length != 256");
  /* Note that the length 255 (match length 258) can be represented
   * in two different ways: code 284 + 5 bits or code 285, so we
   * overwrite length_code[255] to use the best encoding:
   */
  _length_code[length - 1] = code;

  /* Initialize the mapping dist (0..32K) -> dist code (0..29) */
  dist = 0;
  for (code = 0; code < 16; code++) {
    base_dist[code] = dist;
    for (n = 0; n < (1 << extra_dbits[code]); n++) {
      _dist_code[dist++] = code;
    }
  }
  //Assert (dist == 256, "tr_static_init: dist != 256");
  dist >>= 7; /* from now on, all distances are divided by 128 */
  for (; code < D_CODES; code++) {
    base_dist[code] = dist << 7;
    for (n = 0; n < (1 << (extra_dbits[code] - 7)); n++) {
      _dist_code[256 + dist++] = code;
    }
  }
  //Assert (dist == 256, "tr_static_init: 256+dist != 512");

  /* Construct the codes of the static literal tree */
  for (bits = 0; bits <= MAX_BITS; bits++) {
    bl_count[bits] = 0;
  }

  n = 0;
  while (n <= 143) {
    static_ltree[n * 2 + 1]/*.Len*/ = 8;
    n++;
    bl_count[8]++;
  }
  while (n <= 255) {
    static_ltree[n * 2 + 1]/*.Len*/ = 9;
    n++;
    bl_count[9]++;
  }
  while (n <= 279) {
    static_ltree[n * 2 + 1]/*.Len*/ = 7;
    n++;
    bl_count[7]++;
  }
  while (n <= 287) {
    static_ltree[n * 2 + 1]/*.Len*/ = 8;
    n++;
    bl_count[8]++;
  }
  /* Codes 286 and 287 do not exist, but we must include them in the
   * tree construction to get a canonical Huffman tree (longest code
   * all ones)
   */
  gen_codes(static_ltree, L_CODES + 1, bl_count);

  /* The static distance tree is trivial: */
  for (n = 0; n < D_CODES; n++) {
    static_dtree[n * 2 + 1]/*.Len*/ = 5;
    static_dtree[n * 2]/*.Code*/ = bi_reverse(n, 5);
  }

  // Now data ready and we can init static trees
  static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
  static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0,          D_CODES, MAX_BITS);
  static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0,         BL_CODES, MAX_BL_BITS);

  //static_init_done = true;
};


/* ===========================================================================
 * Initialize a new block.
 */
const init_block = (s) => {

  let n; /* iterates over tree elements */

  /* Initialize the trees. */
  for (n = 0; n < L_CODES;  n++) { s.dyn_ltree[n * 2]/*.Freq*/ = 0; }
  for (n = 0; n < D_CODES;  n++) { s.dyn_dtree[n * 2]/*.Freq*/ = 0; }
  for (n = 0; n < BL_CODES; n++) { s.bl_tree[n * 2]/*.Freq*/ = 0; }

  s.dyn_ltree[END_BLOCK * 2]/*.Freq*/ = 1;
  s.opt_len = s.static_len = 0;
  s.last_lit = s.matches = 0;
};


/* ===========================================================================
 * Flush the bit buffer and align the output on a byte boundary
 */
const bi_windup = (s) =>
{
  if (s.bi_valid > 8) {
    put_short(s, s.bi_buf);
  } else if (s.bi_valid > 0) {
    //put_byte(s, (Byte)s->bi_buf);
    s.pending_buf[s.pending++] = s.bi_buf;
  }
  s.bi_buf = 0;
  s.bi_valid = 0;
};

/* ===========================================================================
 * Copy a stored block, storing first the length and its
 * one's complement if requested.
 */
const copy_block = (s, buf, len, header) =>
//DeflateState *s;
//charf    *buf;    /* the input data */
//unsigned len;     /* its length */
//int      header;  /* true if block header must be written */
{
  bi_windup(s);        /* align on byte boundary */

  if (header) {
    put_short(s, len);
    put_short(s, ~len);
  }
//  while (len--) {
//    put_byte(s, *buf++);
//  }
  s.pending_buf.set(s.window.subarray(buf, buf + len), s.pending);
  s.pending += len;
};

/* ===========================================================================
 * Compares to subtrees, using the tree depth as tie breaker when
 * the subtrees have equal frequency. This minimizes the worst case length.
 */
const smaller = (tree, n, m, depth) => {

  const _n2 = n * 2;
  const _m2 = m * 2;
  return (tree[_n2]/*.Freq*/ < tree[_m2]/*.Freq*/ ||
         (tree[_n2]/*.Freq*/ === tree[_m2]/*.Freq*/ && depth[n] <= depth[m]));
};

/* ===========================================================================
 * Restore the heap property by moving down the tree starting at node k,
 * exchanging a node with the smallest of its two sons if necessary, stopping
 * when the heap property is re-established (each father smaller than its
 * two sons).
 */
const pqdownheap = (s, tree, k) =>
//    deflate_state *s;
//    ct_data *tree;  /* the tree to restore */
//    int k;               /* node to move down */
{
  const v = s.heap[k];
  let j = k << 1;  /* left son of k */
  while (j <= s.heap_len) {
    /* Set j to the smallest of the two sons: */
    if (j < s.heap_len &&
      smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
      j++;
    }
    /* Exit if v is smaller than both sons */
    if (smaller(tree, v, s.heap[j], s.depth)) { break; }

    /* Exchange v with the smallest son */
    s.heap[k] = s.heap[j];
    k = j;

    /* And continue down the tree, setting j to the left son of k */
    j <<= 1;
  }
  s.heap[k] = v;
};


// inlined manually
// const SMALLEST = 1;

/* ===========================================================================
 * Send the block data compressed using the given Huffman trees
 */
const compress_block = (s, ltree, dtree) =>
//    deflate_state *s;
//    const ct_data *ltree; /* literal tree */
//    const ct_data *dtree; /* distance tree */
{
  let dist;           /* distance of matched string */
  let lc;             /* match length or unmatched char (if dist == 0) */
  let lx = 0;         /* running index in l_buf */
  let code;           /* the code to send */
  let extra;          /* number of extra bits to send */

  if (s.last_lit !== 0) {
    do {
      dist = (s.pending_buf[s.d_buf + lx * 2] << 8) | (s.pending_buf[s.d_buf + lx * 2 + 1]);
      lc = s.pending_buf[s.l_buf + lx];
      lx++;

      if (dist === 0) {
        send_code(s, lc, ltree); /* send a literal byte */
        //Tracecv(isgraph(lc), (stderr," '%c' ", lc));
      } else {
        /* Here, lc is the match length - MIN_MATCH */
        code = _length_code[lc];
        send_code(s, code + LITERALS + 1, ltree); /* send the length code */
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra);       /* send the extra length bits */
        }
        dist--; /* dist is now the match distance - 1 */
        code = d_code(dist);
        //Assert (code < D_CODES, "bad d_code");

        send_code(s, code, dtree);       /* send the distance code */
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra);   /* send the extra distance bits */
        }
      } /* literal or match pair ? */

      /* Check that the overlay between pending_buf and d_buf+l_buf is ok: */
      //Assert((uInt)(s->pending) < s->lit_bufsize + 2*lx,
      //       "pendingBuf overflow");

    } while (lx < s.last_lit);
  }

  send_code(s, END_BLOCK, ltree);
};


/* ===========================================================================
 * Construct one Huffman tree and assigns the code bit strings and lengths.
 * Update the total bit length for the current block.
 * IN assertion: the field freq is set for all tree elements.
 * OUT assertions: the fields len and code are set to the optimal bit length
 *     and corresponding code. The length opt_len is updated; static_len is
 *     also updated if stree is not null. The field max_code is set.
 */
const build_tree = (s, desc) =>
//    deflate_state *s;
//    tree_desc *desc; /* the tree descriptor */
{
  const tree     = desc.dyn_tree;
  const stree    = desc.stat_desc.static_tree;
  const has_stree = desc.stat_desc.has_stree;
  const elems    = desc.stat_desc.elems;
  let n, m;          /* iterate over heap elements */
  let max_code = -1; /* largest code with non zero frequency */
  let node;          /* new node being created */

  /* Construct the initial heap, with least frequent element in
   * heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
   * heap[0] is not used.
   */
  s.heap_len = 0;
  s.heap_max = HEAP_SIZE;

  for (n = 0; n < elems; n++) {
    if (tree[n * 2]/*.Freq*/ !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;

    } else {
      tree[n * 2 + 1]/*.Len*/ = 0;
    }
  }

  /* The pkzip format requires that at least one distance code exists,
   * and that at least one bit should be sent even if there is only one
   * possible code. So to avoid special checks later on we force at least
   * two codes of non zero frequency.
   */
  while (s.heap_len < 2) {
    node = s.heap[++s.heap_len] = (max_code < 2 ? ++max_code : 0);
    tree[node * 2]/*.Freq*/ = 1;
    s.depth[node] = 0;
    s.opt_len--;

    if (has_stree) {
      s.static_len -= stree[node * 2 + 1]/*.Len*/;
    }
    /* node is 0 or 1 so it does not have extra bits */
  }
  desc.max_code = max_code;

  /* The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
   * establish sub-heaps of increasing lengths:
   */
  for (n = (s.heap_len >> 1/*int /2*/); n >= 1; n--) { pqdownheap(s, tree, n); }

  /* Construct the Huffman tree by repeatedly combining the least two
   * frequent nodes.
   */
  node = elems;              /* next internal node of the tree */
  do {
    //pqremove(s, tree, n);  /* n = node of least frequency */
    /*** pqremove ***/
    n = s.heap[1/*SMALLEST*/];
    s.heap[1/*SMALLEST*/] = s.heap[s.heap_len--];
    pqdownheap(s, tree, 1/*SMALLEST*/);
    /***/

    m = s.heap[1/*SMALLEST*/]; /* m = node of next least frequency */

    s.heap[--s.heap_max] = n; /* keep the nodes sorted by frequency */
    s.heap[--s.heap_max] = m;

    /* Create a new node father of n and m */
    tree[node * 2]/*.Freq*/ = tree[n * 2]/*.Freq*/ + tree[m * 2]/*.Freq*/;
    s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
    tree[n * 2 + 1]/*.Dad*/ = tree[m * 2 + 1]/*.Dad*/ = node;

    /* and insert the new node in the heap */
    s.heap[1/*SMALLEST*/] = node++;
    pqdownheap(s, tree, 1/*SMALLEST*/);

  } while (s.heap_len >= 2);

  s.heap[--s.heap_max] = s.heap[1/*SMALLEST*/];

  /* At this point, the fields freq and dad are set. We can now
   * generate the bit lengths.
   */
  gen_bitlen(s, desc);

  /* The field len is now set, we can generate the bit codes */
  gen_codes(tree, max_code, s.bl_count);
};


/* ===========================================================================
 * Scan a literal or distance tree to determine the frequencies of the codes
 * in the bit length tree.
 */
const scan_tree = (s, tree, max_code) =>
//    deflate_state *s;
//    ct_data *tree;   /* the tree to be scanned */
//    int max_code;    /* and its largest code of non zero frequency */
{
  let n;                     /* iterates over all tree elements */
  let prevlen = -1;          /* last emitted length */
  let curlen;                /* length of current code */

  let nextlen = tree[0 * 2 + 1]/*.Len*/; /* length of next code */

  let count = 0;             /* repeat count of the current code */
  let max_count = 7;         /* max repeat count */
  let min_count = 4;         /* min repeat count */

  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[(max_code + 1) * 2 + 1]/*.Len*/ = 0xffff; /* guard */

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1]/*.Len*/;

    if (++count < max_count && curlen === nextlen) {
      continue;

    } else if (count < min_count) {
      s.bl_tree[curlen * 2]/*.Freq*/ += count;

    } else if (curlen !== 0) {

      if (curlen !== prevlen) { s.bl_tree[curlen * 2]/*.Freq*/++; }
      s.bl_tree[REP_3_6 * 2]/*.Freq*/++;

    } else if (count <= 10) {
      s.bl_tree[REPZ_3_10 * 2]/*.Freq*/++;

    } else {
      s.bl_tree[REPZ_11_138 * 2]/*.Freq*/++;
    }

    count = 0;
    prevlen = curlen;

    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;

    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;

    } else {
      max_count = 7;
      min_count = 4;
    }
  }
};


/* ===========================================================================
 * Send a literal or distance tree in compressed form, using the codes in
 * bl_tree.
 */
const send_tree = (s, tree, max_code) =>
//    deflate_state *s;
//    ct_data *tree; /* the tree to be scanned */
//    int max_code;       /* and its largest code of non zero frequency */
{
  let n;                     /* iterates over all tree elements */
  let prevlen = -1;          /* last emitted length */
  let curlen;                /* length of current code */

  let nextlen = tree[0 * 2 + 1]/*.Len*/; /* length of next code */

  let count = 0;             /* repeat count of the current code */
  let max_count = 7;         /* max repeat count */
  let min_count = 4;         /* min repeat count */

  /* tree[max_code+1].Len = -1; */  /* guard already set */
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1]/*.Len*/;

    if (++count < max_count && curlen === nextlen) {
      continue;

    } else if (count < min_count) {
      do { send_code(s, curlen, s.bl_tree); } while (--count !== 0);

    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        send_code(s, curlen, s.bl_tree);
        count--;
      }
      //Assert(count >= 3 && count <= 6, " 3_6?");
      send_code(s, REP_3_6, s.bl_tree);
      send_bits(s, count - 3, 2);

    } else if (count <= 10) {
      send_code(s, REPZ_3_10, s.bl_tree);
      send_bits(s, count - 3, 3);

    } else {
      send_code(s, REPZ_11_138, s.bl_tree);
      send_bits(s, count - 11, 7);
    }

    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;

    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;

    } else {
      max_count = 7;
      min_count = 4;
    }
  }
};


/* ===========================================================================
 * Construct the Huffman tree for the bit lengths and return the index in
 * bl_order of the last bit length code to send.
 */
const build_bl_tree = (s) => {

  let max_blindex;  /* index of last bit length code of non zero freq */

  /* Determine the bit length frequencies for literal and distance trees */
  scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
  scan_tree(s, s.dyn_dtree, s.d_desc.max_code);

  /* Build the bit length tree: */
  build_tree(s, s.bl_desc);
  /* opt_len now includes the length of the tree representations, except
   * the lengths of the bit lengths codes and the 5+5+4 bits for the counts.
   */

  /* Determine the number of bit length codes to send. The pkzip format
   * requires that at least 4 bit length codes be sent. (appnote.txt says
   * 3 but the actual value used is 4.)
   */
  for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
    if (s.bl_tree[bl_order[max_blindex] * 2 + 1]/*.Len*/ !== 0) {
      break;
    }
  }
  /* Update opt_len to include the bit length tree and counts */
  s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
  //Tracev((stderr, "\ndyn trees: dyn %ld, stat %ld",
  //        s->opt_len, s->static_len));

  return max_blindex;
};


/* ===========================================================================
 * Send the header for a block using dynamic Huffman trees: the counts, the
 * lengths of the bit length codes, the literal tree and the distance tree.
 * IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
 */
const send_all_trees = (s, lcodes, dcodes, blcodes) =>
//    deflate_state *s;
//    int lcodes, dcodes, blcodes; /* number of codes for each tree */
{
  let rank;                    /* index in bl_order */

  //Assert (lcodes >= 257 && dcodes >= 1 && blcodes >= 4, "not enough codes");
  //Assert (lcodes <= L_CODES && dcodes <= D_CODES && blcodes <= BL_CODES,
  //        "too many codes");
  //Tracev((stderr, "\nbl counts: "));
  send_bits(s, lcodes - 257, 5); /* not +255 as stated in appnote.txt */
  send_bits(s, dcodes - 1,   5);
  send_bits(s, blcodes - 4,  4); /* not -3 as stated in appnote.txt */
  for (rank = 0; rank < blcodes; rank++) {
    //Tracev((stderr, "\nbl code %2d ", bl_order[rank]));
    send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1]/*.Len*/, 3);
  }
  //Tracev((stderr, "\nbl tree: sent %ld", s->bits_sent));

  send_tree(s, s.dyn_ltree, lcodes - 1); /* literal tree */
  //Tracev((stderr, "\nlit tree: sent %ld", s->bits_sent));

  send_tree(s, s.dyn_dtree, dcodes - 1); /* distance tree */
  //Tracev((stderr, "\ndist tree: sent %ld", s->bits_sent));
};


/* ===========================================================================
 * Check if the data type is TEXT or BINARY, using the following algorithm:
 * - TEXT if the two conditions below are satisfied:
 *    a) There are no non-portable control characters belonging to the
 *       "black list" (0..6, 14..25, 28..31).
 *    b) There is at least one printable character belonging to the
 *       "white list" (9 {TAB}, 10 {LF}, 13 {CR}, 32..255).
 * - BINARY otherwise.
 * - The following partially-portable control characters form a
 *   "gray list" that is ignored in this detection algorithm:
 *   (7 {BEL}, 8 {BS}, 11 {VT}, 12 {FF}, 26 {SUB}, 27 {ESC}).
 * IN assertion: the fields Freq of dyn_ltree are set.
 */
const detect_data_type = (s) => {
  /* black_mask is the bit mask of black-listed bytes
   * set bits 0..6, 14..25, and 28..31
   * 0xf3ffc07f = binary 11110011111111111100000001111111
   */
  let black_mask = 0xf3ffc07f;
  let n;

  /* Check for non-textual ("black-listed") bytes. */
  for (n = 0; n <= 31; n++, black_mask >>>= 1) {
    if ((black_mask & 1) && (s.dyn_ltree[n * 2]/*.Freq*/ !== 0)) {
      return Z_BINARY;
    }
  }

  /* Check for textual ("white-listed") bytes. */
  if (s.dyn_ltree[9 * 2]/*.Freq*/ !== 0 || s.dyn_ltree[10 * 2]/*.Freq*/ !== 0 ||
      s.dyn_ltree[13 * 2]/*.Freq*/ !== 0) {
    return Z_TEXT;
  }
  for (n = 32; n < LITERALS; n++) {
    if (s.dyn_ltree[n * 2]/*.Freq*/ !== 0) {
      return Z_TEXT;
    }
  }

  /* There are no "black-listed" or "white-listed" bytes:
   * this stream either is empty or has tolerated ("gray-listed") bytes only.
   */
  return Z_BINARY;
};


let static_init_done = false;

/* ===========================================================================
 * Initialize the tree data structures for a new zlib stream.
 */
const _tr_init = (s) =>
{

  if (!static_init_done) {
    tr_static_init();
    static_init_done = true;
  }

  s.l_desc  = new TreeDesc(s.dyn_ltree, static_l_desc);
  s.d_desc  = new TreeDesc(s.dyn_dtree, static_d_desc);
  s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);

  s.bi_buf = 0;
  s.bi_valid = 0;

  /* Initialize the first block of the first file: */
  init_block(s);
};


/* ===========================================================================
 * Send a stored block
 */
const _tr_stored_block = (s, buf, stored_len, last) =>
//DeflateState *s;
//charf *buf;       /* input block */
//ulg stored_len;   /* length of input block */
//int last;         /* one if this is the last block for a file */
{
  send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);    /* send block type */
  copy_block(s, buf, stored_len, true); /* with header */
};


/* ===========================================================================
 * Send one empty static block to give enough lookahead for inflate.
 * This takes 10 bits, of which 7 may remain in the bit buffer.
 */
const _tr_align = (s) => {
  send_bits(s, STATIC_TREES << 1, 3);
  send_code(s, END_BLOCK, static_ltree);
  bi_flush(s);
};


/* ===========================================================================
 * Determine the best encoding for the current block: dynamic trees, static
 * trees or store, and output the encoded block to the zip file.
 */
const _tr_flush_block = (s, buf, stored_len, last) =>
//DeflateState *s;
//charf *buf;       /* input block, or NULL if too old */
//ulg stored_len;   /* length of input block */
//int last;         /* one if this is the last block for a file */
{
  let opt_lenb, static_lenb;  /* opt_len and static_len in bytes */
  let max_blindex = 0;        /* index of last bit length code of non zero freq */

  /* Build the Huffman trees unless a stored block is forced */
  if (s.level > 0) {

    /* Check if the file is binary or text */
    if (s.strm.data_type === Z_UNKNOWN) {
      s.strm.data_type = detect_data_type(s);
    }

    /* Construct the literal and distance trees */
    build_tree(s, s.l_desc);
    // Tracev((stderr, "\nlit data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));

    build_tree(s, s.d_desc);
    // Tracev((stderr, "\ndist data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));
    /* At this point, opt_len and static_len are the total bit lengths of
     * the compressed block data, excluding the tree representations.
     */

    /* Build the bit length tree for the above two trees, and get the index
     * in bl_order of the last bit length code to send.
     */
    max_blindex = build_bl_tree(s);

    /* Determine the best encoding. Compute the block lengths in bytes. */
    opt_lenb = (s.opt_len + 3 + 7) >>> 3;
    static_lenb = (s.static_len + 3 + 7) >>> 3;

    // Tracev((stderr, "\nopt %lu(%lu) stat %lu(%lu) stored %lu lit %u ",
    //        opt_lenb, s->opt_len, static_lenb, s->static_len, stored_len,
    //        s->last_lit));

    if (static_lenb <= opt_lenb) { opt_lenb = static_lenb; }

  } else {
    // Assert(buf != (char*)0, "lost buf");
    opt_lenb = static_lenb = stored_len + 5; /* force a stored block */
  }

  if ((stored_len + 4 <= opt_lenb) && (buf !== -1)) {
    /* 4: two words for the lengths */

    /* The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
     * Otherwise we can't have processed more than WSIZE input bytes since
     * the last block flush, because compression would have been
     * successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
     * transform a block into a stored block.
     */
    _tr_stored_block(s, buf, stored_len, last);

  } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {

    send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
    compress_block(s, static_ltree, static_dtree);

  } else {
    send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
    send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
    compress_block(s, s.dyn_ltree, s.dyn_dtree);
  }
  // Assert (s->compressed_len == s->bits_sent, "bad compressed size");
  /* The above check is made mod 2^32, for files larger than 512 MB
   * and uLong implemented on 32 bits.
   */
  init_block(s);

  if (last) {
    bi_windup(s);
  }
  // Tracev((stderr,"\ncomprlen %lu(%lu) ", s->compressed_len>>3,
  //       s->compressed_len-7*last));
};

/* ===========================================================================
 * Save the match info and tally the frequency counts. Return true if
 * the current block must be flushed.
 */
const _tr_tally = (s, dist, lc) =>
//    deflate_state *s;
//    unsigned dist;  /* distance of matched string */
//    unsigned lc;    /* match length-MIN_MATCH or unmatched char (if dist==0) */
{
  //let out_length, in_length, dcode;

  s.pending_buf[s.d_buf + s.last_lit * 2]     = (dist >>> 8) & 0xff;
  s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 0xff;

  s.pending_buf[s.l_buf + s.last_lit] = lc & 0xff;
  s.last_lit++;

  if (dist === 0) {
    /* lc is the unmatched char */
    s.dyn_ltree[lc * 2]/*.Freq*/++;
  } else {
    s.matches++;
    /* Here, lc is the match length - MIN_MATCH */
    dist--;             /* dist = match distance - 1 */
    //Assert((ush)dist < (ush)MAX_DIST(s) &&
    //       (ush)lc <= (ush)(MAX_MATCH-MIN_MATCH) &&
    //       (ush)d_code(dist) < (ush)D_CODES,  "_tr_tally: bad match");

    s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]/*.Freq*/++;
    s.dyn_dtree[d_code(dist) * 2]/*.Freq*/++;
  }

// (!) This block is disabled in zlib defaults,
// don't enable it for binary compatibility

//#ifdef TRUNCATE_BLOCK
//  /* Try to guess if it is profitable to stop the current block here */
//  if ((s.last_lit & 0x1fff) === 0 && s.level > 2) {
//    /* Compute an upper bound for the compressed length */
//    out_length = s.last_lit*8;
//    in_length = s.strstart - s.block_start;
//
//    for (dcode = 0; dcode < D_CODES; dcode++) {
//      out_length += s.dyn_dtree[dcode*2]/*.Freq*/ * (5 + extra_dbits[dcode]);
//    }
//    out_length >>>= 3;
//    //Tracev((stderr,"\nlast_lit %u, in %ld, out ~%ld(%ld%%) ",
//    //       s->last_lit, in_length, out_length,
//    //       100L - out_length*100L/in_length));
//    if (s.matches < (s.last_lit>>1)/*int /2*/ && out_length < (in_length>>1)/*int /2*/) {
//      return true;
//    }
//  }
//#endif

  return (s.last_lit === s.lit_bufsize - 1);
  /* We avoid equality with lit_bufsize because of wraparound at 64K
   * on 16 bit machines and because stored blocks are restricted to
   * 64K-1 bytes.
   */
};

var _tr_init_1  = _tr_init;
var _tr_stored_block_1 = _tr_stored_block;
var _tr_flush_block_1  = _tr_flush_block;
var _tr_tally_1 = _tr_tally;
var _tr_align_1 = _tr_align;

var trees = {
	_tr_init: _tr_init_1,
	_tr_stored_block: _tr_stored_block_1,
	_tr_flush_block: _tr_flush_block_1,
	_tr_tally: _tr_tally_1,
	_tr_align: _tr_align_1
};

// Note: adler32 takes 12% for level 0 and 2% for level 6.
// It isn't worth it to make additional optimizations as in original.
// Small size is preferable.

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

const adler32 = (adler, buf, len, pos) => {
  let s1 = (adler & 0xffff) |0,
      s2 = ((adler >>> 16) & 0xffff) |0,
      n = 0;

  while (len !== 0) {
    // Set limit ~ twice less than 5552, to keep
    // s2 in 31-bits, because we force signed ints.
    // in other case %= will fail.
    n = len > 2000 ? 2000 : len;
    len -= n;

    do {
      s1 = (s1 + buf[pos++]) |0;
      s2 = (s2 + s1) |0;
    } while (--n);

    s1 %= 65521;
    s2 %= 65521;
  }

  return (s1 | (s2 << 16)) |0;
};


var adler32_1 = adler32;

// Note: we can't get significant speed boost here.
// So write code to minimize size - no pregenerated tables
// and array tools dependencies.

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

// Use ordinary array, since untyped makes no boost here
const makeTable = () => {
  let c, table = [];

  for (var n = 0; n < 256; n++) {
    c = n;
    for (var k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }

  return table;
};

// Create table on load. Just 255 signed longs. Not a problem.
const crcTable = new Uint32Array(makeTable());


const crc32 = (crc, buf, len, pos) => {
  const t = crcTable;
  const end = pos + len;

  crc ^= -1;

  for (let i = pos; i < end; i++) {
    crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xFF];
  }

  return (crc ^ (-1)); // >>> 0;
};


var crc32_1 = crc32;

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

var messages = {
  2:      'need dictionary',     /* Z_NEED_DICT       2  */
  1:      'stream end',          /* Z_STREAM_END      1  */
  0:      '',                    /* Z_OK              0  */
  '-1':   'file error',          /* Z_ERRNO         (-1) */
  '-2':   'stream error',        /* Z_STREAM_ERROR  (-2) */
  '-3':   'data error',          /* Z_DATA_ERROR    (-3) */
  '-4':   'insufficient memory', /* Z_MEM_ERROR     (-4) */
  '-5':   'buffer error',        /* Z_BUF_ERROR     (-5) */
  '-6':   'incompatible version' /* Z_VERSION_ERROR (-6) */
};

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

var constants = {

  /* Allowed flush values; see deflate() and inflate() below for details */
  Z_NO_FLUSH:         0,
  Z_PARTIAL_FLUSH:    1,
  Z_SYNC_FLUSH:       2,
  Z_FULL_FLUSH:       3,
  Z_FINISH:           4,
  Z_BLOCK:            5,
  Z_TREES:            6,

  /* Return codes for the compression/decompression functions. Negative values
  * are errors, positive values are used for special but normal events.
  */
  Z_OK:               0,
  Z_STREAM_END:       1,
  Z_NEED_DICT:        2,
  Z_ERRNO:           -1,
  Z_STREAM_ERROR:    -2,
  Z_DATA_ERROR:      -3,
  Z_MEM_ERROR:       -4,
  Z_BUF_ERROR:       -5,
  //Z_VERSION_ERROR: -6,

  /* compression levels */
  Z_NO_COMPRESSION:         0,
  Z_BEST_SPEED:             1,
  Z_BEST_COMPRESSION:       9,
  Z_DEFAULT_COMPRESSION:   -1,


  Z_FILTERED:               1,
  Z_HUFFMAN_ONLY:           2,
  Z_RLE:                    3,
  Z_FIXED:                  4,
  Z_DEFAULT_STRATEGY:       0,

  /* Possible values of the data_type field (though see inflate()) */
  Z_BINARY:                 0,
  Z_TEXT:                   1,
  //Z_ASCII:                1, // = Z_TEXT (deprecated)
  Z_UNKNOWN:                2,

  /* The deflate compression method */
  Z_DEFLATED:               8
  //Z_NULL:                 null // Use -1 or null inline, depending on var type
};

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

const { _tr_init: _tr_init$1, _tr_stored_block: _tr_stored_block$1, _tr_flush_block: _tr_flush_block$1, _tr_tally: _tr_tally$1, _tr_align: _tr_align$1 } = trees;




/* Public constants ==========================================================*/
/* ===========================================================================*/

const {
  Z_NO_FLUSH, Z_PARTIAL_FLUSH, Z_FULL_FLUSH, Z_FINISH, Z_BLOCK,
  Z_OK, Z_STREAM_END, Z_STREAM_ERROR, Z_DATA_ERROR, Z_BUF_ERROR,
  Z_DEFAULT_COMPRESSION,
  Z_FILTERED, Z_HUFFMAN_ONLY, Z_RLE, Z_FIXED: Z_FIXED$1, Z_DEFAULT_STRATEGY,
  Z_UNKNOWN: Z_UNKNOWN$1,
  Z_DEFLATED
} = constants;

/*============================================================================*/


const MAX_MEM_LEVEL = 9;
/* Maximum value for memLevel in deflateInit2 */
const MAX_WBITS = 15;
/* 32K LZ77 window */
const DEF_MEM_LEVEL = 8;


const LENGTH_CODES$1  = 29;
/* number of length codes, not counting the special END_BLOCK code */
const LITERALS$1      = 256;
/* number of literal bytes 0..255 */
const L_CODES$1       = LITERALS$1 + 1 + LENGTH_CODES$1;
/* number of Literal or Length codes, including the END_BLOCK code */
const D_CODES$1       = 30;
/* number of distance codes */
const BL_CODES$1      = 19;
/* number of codes used to transfer the bit lengths */
const HEAP_SIZE$1     = 2 * L_CODES$1 + 1;
/* maximum heap size */
const MAX_BITS$1  = 15;
/* All codes must not exceed MAX_BITS bits */

const MIN_MATCH$1 = 3;
const MAX_MATCH$1 = 258;
const MIN_LOOKAHEAD = (MAX_MATCH$1 + MIN_MATCH$1 + 1);

const PRESET_DICT = 0x20;

const INIT_STATE = 42;
const EXTRA_STATE = 69;
const NAME_STATE = 73;
const COMMENT_STATE = 91;
const HCRC_STATE = 103;
const BUSY_STATE = 113;
const FINISH_STATE = 666;

const BS_NEED_MORE      = 1; /* block not completed, need more input or more output */
const BS_BLOCK_DONE     = 2; /* block flush performed */
const BS_FINISH_STARTED = 3; /* finish started, need only more output at next deflate */
const BS_FINISH_DONE    = 4; /* finish done, accept no more input or output */

const OS_CODE = 0x03; // Unix :) . Don't detect, use this default.

const err = (strm, errorCode) => {
  strm.msg = messages[errorCode];
  return errorCode;
};

const rank = (f) => {
  return ((f) << 1) - ((f) > 4 ? 9 : 0);
};

const zero$1 = (buf) => {
  let len = buf.length; while (--len >= 0) { buf[len] = 0; }
};


/* eslint-disable new-cap */
let HASH_ZLIB = (s, prev, data) => ((prev << s.hash_shift) ^ data) & s.hash_mask;
// This hash causes less collisions, https://github.com/nodeca/pako/issues/135
// But breaks binary compatibility
//let HASH_FAST = (s, prev, data) => ((prev << 8) + (prev >> 8) + (data << 4)) & s.hash_mask;
let HASH = HASH_ZLIB;

/* =========================================================================
 * Flush as much pending output as possible. All deflate() output goes
 * through this function so some applications may wish to modify it
 * to avoid allocating a large strm->output buffer and copying into it.
 * (See also read_buf()).
 */
const flush_pending = (strm) => {
  const s = strm.state;

  //_tr_flush_bits(s);
  let len = s.pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len === 0) { return; }

  strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
  strm.next_out += len;
  s.pending_out += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s.pending -= len;
  if (s.pending === 0) {
    s.pending_out = 0;
  }
};


const flush_block_only = (s, last) => {
  _tr_flush_block$1(s, (s.block_start >= 0 ? s.block_start : -1), s.strstart - s.block_start, last);
  s.block_start = s.strstart;
  flush_pending(s.strm);
};


const put_byte = (s, b) => {
  s.pending_buf[s.pending++] = b;
};


/* =========================================================================
 * Put a short in the pending buffer. The 16-bit value is put in MSB order.
 * IN assertion: the stream state is correct and there is enough room in
 * pending_buf.
 */
const putShortMSB = (s, b) => {

  //  put_byte(s, (Byte)(b >> 8));
//  put_byte(s, (Byte)(b & 0xff));
  s.pending_buf[s.pending++] = (b >>> 8) & 0xff;
  s.pending_buf[s.pending++] = b & 0xff;
};


/* ===========================================================================
 * Read a new buffer from the current input stream, update the adler32
 * and total number of bytes read.  All deflate() input goes through
 * this function so some applications may wish to modify it to avoid
 * allocating a large strm->input buffer and copying from it.
 * (See also flush_pending()).
 */
const read_buf = (strm, buf, start, size) => {

  let len = strm.avail_in;

  if (len > size) { len = size; }
  if (len === 0) { return 0; }

  strm.avail_in -= len;

  // zmemcpy(buf, strm->next_in, len);
  buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);
  if (strm.state.wrap === 1) {
    strm.adler = adler32_1(strm.adler, buf, len, start);
  }

  else if (strm.state.wrap === 2) {
    strm.adler = crc32_1(strm.adler, buf, len, start);
  }

  strm.next_in += len;
  strm.total_in += len;

  return len;
};


/* ===========================================================================
 * Set match_start to the longest match starting at the given string and
 * return its length. Matches shorter or equal to prev_length are discarded,
 * in which case the result is equal to prev_length and match_start is
 * garbage.
 * IN assertions: cur_match is the head of the hash chain for the current
 *   string (strstart) and its distance is <= MAX_DIST, and prev_length >= 1
 * OUT assertion: the match length is not greater than s->lookahead.
 */
const longest_match = (s, cur_match) => {

  let chain_length = s.max_chain_length;      /* max hash chain length */
  let scan = s.strstart; /* current string */
  let match;                       /* matched string */
  let len;                           /* length of current match */
  let best_len = s.prev_length;              /* best match length so far */
  let nice_match = s.nice_match;             /* stop if match long enough */
  const limit = (s.strstart > (s.w_size - MIN_LOOKAHEAD)) ?
      s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0/*NIL*/;

  const _win = s.window; // shortcut

  const wmask = s.w_mask;
  const prev  = s.prev;

  /* Stop when cur_match becomes <= limit. To simplify the code,
   * we prevent matches with the string of window index 0.
   */

  const strend = s.strstart + MAX_MATCH$1;
  let scan_end1  = _win[scan + best_len - 1];
  let scan_end   = _win[scan + best_len];

  /* The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of 16.
   * It is easy to get rid of this optimization if necessary.
   */
  // Assert(s->hash_bits >= 8 && MAX_MATCH == 258, "Code too clever");

  /* Do not waste too much time if we already have a good match: */
  if (s.prev_length >= s.good_match) {
    chain_length >>= 2;
  }
  /* Do not look for matches beyond the end of the input. This is necessary
   * to make deflate deterministic.
   */
  if (nice_match > s.lookahead) { nice_match = s.lookahead; }

  // Assert((ulg)s->strstart <= s->window_size-MIN_LOOKAHEAD, "need lookahead");

  do {
    // Assert(cur_match < s->strstart, "no future");
    match = cur_match;

    /* Skip to next match if the match length cannot increase
     * or if the match length is less than 2.  Note that the checks below
     * for insufficient lookahead only occur occasionally for performance
     * reasons.  Therefore uninitialized memory will be accessed, and
     * conditional jumps will be made that depend on those values.
     * However the length of the match is limited to the lookahead, so
     * the output of deflate is not affected by the uninitialized values.
     */

    if (_win[match + best_len]     !== scan_end  ||
        _win[match + best_len - 1] !== scan_end1 ||
        _win[match]                !== _win[scan] ||
        _win[++match]              !== _win[scan + 1]) {
      continue;
    }

    /* The check at best_len-1 can be removed because it will be made
     * again later. (This heuristic is not always a win.)
     * It is not necessary to compare scan[2] and match[2] since they
     * are always equal when the other bytes match, given that
     * the hash keys are equal and that HASH_BITS >= 8.
     */
    scan += 2;
    match++;
    // Assert(*scan == *match, "match[2]?");

    /* We check for insufficient lookahead only every 8th comparison;
     * the 256th check will be made at strstart+258.
     */
    do {
      /*jshint noempty:false*/
    } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             scan < strend);

    // Assert(scan <= s->window+(unsigned)(s->window_size-1), "wild scan");

    len = MAX_MATCH$1 - (strend - scan);
    scan = strend - MAX_MATCH$1;

    if (len > best_len) {
      s.match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1  = _win[scan + best_len - 1];
      scan_end   = _win[scan + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);

  if (best_len <= s.lookahead) {
    return best_len;
  }
  return s.lookahead;
};


/* ===========================================================================
 * Fill the window when the lookahead becomes insufficient.
 * Updates strstart and lookahead.
 *
 * IN assertion: lookahead < MIN_LOOKAHEAD
 * OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
 *    At least one byte has been read, or avail_in == 0; reads are
 *    performed for at least two bytes (required for the zip translate_eol
 *    option -- not supported here).
 */
const fill_window = (s) => {

  const _w_size = s.w_size;
  let p, n, m, more, str;

  //Assert(s->lookahead < MIN_LOOKAHEAD, "already enough lookahead");

  do {
    more = s.window_size - s.lookahead - s.strstart;

    // JS ints have 32 bit, block below not needed
    /* Deal with !@#$% 64K limit: */
    //if (sizeof(int) <= 2) {
    //    if (more == 0 && s->strstart == 0 && s->lookahead == 0) {
    //        more = wsize;
    //
    //  } else if (more == (unsigned)(-1)) {
    //        /* Very unlikely, but possible on 16 bit machine if
    //         * strstart == 0 && lookahead == 1 (input done a byte at time)
    //         */
    //        more--;
    //    }
    //}


    /* If the window is almost full and there is insufficient lookahead,
     * move the upper half to the lower one to make room in the upper half.
     */
    if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {

      s.window.set(s.window.subarray(_w_size, _w_size + _w_size), 0);
      s.match_start -= _w_size;
      s.strstart -= _w_size;
      /* we now have strstart >= MAX_DIST */
      s.block_start -= _w_size;

      /* Slide the hash table (could be avoided with 32 bit values
       at the expense of memory usage). We slide even when level == 0
       to keep the hash table consistent if we switch back to level > 0
       later. (Using level 0 permanently is not an optimal usage of
       zlib, so we don't care about this pathological case.)
       */

      n = s.hash_size;
      p = n;

      do {
        m = s.head[--p];
        s.head[p] = (m >= _w_size ? m - _w_size : 0);
      } while (--n);

      n = _w_size;
      p = n;

      do {
        m = s.prev[--p];
        s.prev[p] = (m >= _w_size ? m - _w_size : 0);
        /* If n is not on any hash chain, prev[n] is garbage but
         * its value will never be used.
         */
      } while (--n);

      more += _w_size;
    }
    if (s.strm.avail_in === 0) {
      break;
    }

    /* If there was no sliding:
     *    strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
     *    more == window_size - lookahead - strstart
     * => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
     * => more >= window_size - 2*WSIZE + 2
     * In the BIG_MEM or MMAP case (not yet supported),
     *   window_size == input_size + MIN_LOOKAHEAD  &&
     *   strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
     * Otherwise, window_size == 2*WSIZE so more >= 2.
     * If there was sliding, more >= WSIZE. So in all cases, more >= 2.
     */
    //Assert(more >= 2, "more < 2");
    n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
    s.lookahead += n;

    /* Initialize the hash value now that we have some input: */
    if (s.lookahead + s.insert >= MIN_MATCH$1) {
      str = s.strstart - s.insert;
      s.ins_h = s.window[str];

      /* UPDATE_HASH(s, s->ins_h, s->window[str + 1]); */
      s.ins_h = HASH(s, s.ins_h, s.window[str + 1]);
//#if MIN_MATCH != 3
//        Call update_hash() MIN_MATCH-3 more times
//#endif
      while (s.insert) {
        /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
        s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH$1 - 1]);

        s.prev[str & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = str;
        str++;
        s.insert--;
        if (s.lookahead + s.insert < MIN_MATCH$1) {
          break;
        }
      }
    }
    /* If the whole input has less than MIN_MATCH bytes, ins_h is garbage,
     * but this is not important since only literal bytes will be emitted.
     */

  } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);

  /* If the WIN_INIT bytes after the end of the current data have never been
   * written, then zero those bytes in order to avoid memory check reports of
   * the use of uninitialized (or uninitialised as Julian writes) bytes by
   * the longest match routines.  Update the high water mark for the next
   * time through here.  WIN_INIT is set to MAX_MATCH since the longest match
   * routines allow scanning to strstart + MAX_MATCH, ignoring lookahead.
   */
//  if (s.high_water < s.window_size) {
//    const curr = s.strstart + s.lookahead;
//    let init = 0;
//
//    if (s.high_water < curr) {
//      /* Previous high water mark below current data -- zero WIN_INIT
//       * bytes or up to end of window, whichever is less.
//       */
//      init = s.window_size - curr;
//      if (init > WIN_INIT)
//        init = WIN_INIT;
//      zmemzero(s->window + curr, (unsigned)init);
//      s->high_water = curr + init;
//    }
//    else if (s->high_water < (ulg)curr + WIN_INIT) {
//      /* High water mark at or above current data, but below current data
//       * plus WIN_INIT -- zero out to current data plus WIN_INIT, or up
//       * to end of window, whichever is less.
//       */
//      init = (ulg)curr + WIN_INIT - s->high_water;
//      if (init > s->window_size - s->high_water)
//        init = s->window_size - s->high_water;
//      zmemzero(s->window + s->high_water, (unsigned)init);
//      s->high_water += init;
//    }
//  }
//
//  Assert((ulg)s->strstart <= s->window_size - MIN_LOOKAHEAD,
//    "not enough room for search");
};

/* ===========================================================================
 * Copy without compression as much as possible from the input stream, return
 * the current block state.
 * This function does not insert new strings in the dictionary since
 * uncompressible data is probably not useful. This function is used
 * only for the level=0 compression option.
 * NOTE: this function should be optimized to avoid extra copying from
 * window to pending_buf.
 */
const deflate_stored = (s, flush) => {

  /* Stored blocks are limited to 0xffff bytes, pending_buf is limited
   * to pending_buf_size, and each stored block has a 5 byte header:
   */
  let max_block_size = 0xffff;

  if (max_block_size > s.pending_buf_size - 5) {
    max_block_size = s.pending_buf_size - 5;
  }

  /* Copy as much as possible from input to output: */
  for (;;) {
    /* Fill the window as much as possible: */
    if (s.lookahead <= 1) {

      //Assert(s->strstart < s->w_size+MAX_DIST(s) ||
      //  s->block_start >= (long)s->w_size, "slide too late");
//      if (!(s.strstart < s.w_size + (s.w_size - MIN_LOOKAHEAD) ||
//        s.block_start >= s.w_size)) {
//        throw  new Error("slide too late");
//      }

      fill_window(s);
      if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }

      if (s.lookahead === 0) {
        break;
      }
      /* flush the current block */
    }
    //Assert(s->block_start >= 0L, "block gone");
//    if (s.block_start < 0) throw new Error("block gone");

    s.strstart += s.lookahead;
    s.lookahead = 0;

    /* Emit a stored block if pending_buf will be full: */
    const max_start = s.block_start + max_block_size;

    if (s.strstart === 0 || s.strstart >= max_start) {
      /* strstart == 0 is possible when wraparound on 16-bit machine */
      s.lookahead = s.strstart - max_start;
      s.strstart = max_start;
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/


    }
    /* Flush if we may have to slide, otherwise block_start may become
     * negative and the data will be gone:
     */
    if (s.strstart - s.block_start >= (s.w_size - MIN_LOOKAHEAD)) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }

  s.insert = 0;

  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }

  if (s.strstart > s.block_start) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }

  return BS_NEED_MORE;
};

/* ===========================================================================
 * Compress as much as possible from the input stream, return the current
 * block state.
 * This function does not perform lazy evaluation of matches and inserts
 * new strings in the dictionary only for unmatched strings or for short
 * matches. It is used only for the fast compression options.
 */
const deflate_fast = (s, flush) => {

  let hash_head;        /* head of the hash chain */
  let bflush;           /* set if current block must be flushed */

  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break; /* flush the current block */
      }
    }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
    hash_head = 0/*NIL*/;
    if (s.lookahead >= MIN_MATCH$1) {
      /*** INSERT_STRING(s, s.strstart, hash_head); ***/
      s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH$1 - 1]);
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
      /***/
    }

    /* Find the longest match, discarding those <= prev_length.
     * At this point we have always match_length < MIN_MATCH
     */
    if (hash_head !== 0/*NIL*/ && ((s.strstart - hash_head) <= (s.w_size - MIN_LOOKAHEAD))) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
      s.match_length = longest_match(s, hash_head);
      /* longest_match() sets match_start */
    }
    if (s.match_length >= MIN_MATCH$1) {
      // check_match(s, s.strstart, s.match_start, s.match_length); // for debug only

      /*** _tr_tally_dist(s, s.strstart - s.match_start,
                     s.match_length - MIN_MATCH, bflush); ***/
      bflush = _tr_tally$1(s, s.strstart - s.match_start, s.match_length - MIN_MATCH$1);

      s.lookahead -= s.match_length;

      /* Insert new strings in the hash table only if the match length
       * is not too large. This saves time but degrades compression.
       */
      if (s.match_length <= s.max_lazy_match/*max_insert_length*/ && s.lookahead >= MIN_MATCH$1) {
        s.match_length--; /* string at strstart already in table */
        do {
          s.strstart++;
          /*** INSERT_STRING(s, s.strstart, hash_head); ***/
          s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH$1 - 1]);
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
          /***/
          /* strstart never exceeds WSIZE-MAX_MATCH, so there are
           * always MIN_MATCH bytes ahead.
           */
        } while (--s.match_length !== 0);
        s.strstart++;
      } else
      {
        s.strstart += s.match_length;
        s.match_length = 0;
        s.ins_h = s.window[s.strstart];
        /* UPDATE_HASH(s, s.ins_h, s.window[s.strstart+1]); */
        s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + 1]);

//#if MIN_MATCH != 3
//                Call UPDATE_HASH() MIN_MATCH-3 more times
//#endif
        /* If lookahead < MIN_MATCH, ins_h is garbage, but it does not
         * matter since it will be recomputed at next deflate call.
         */
      }
    } else {
      /* No match, output a literal byte */
      //Tracevv((stderr,"%c", s.window[s.strstart]));
      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = _tr_tally$1(s, 0, s.window[s.strstart]);

      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = ((s.strstart < (MIN_MATCH$1 - 1)) ? s.strstart : MIN_MATCH$1 - 1);
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
};

/* ===========================================================================
 * Same as above, but achieves better compression. We use a lazy
 * evaluation for matches: a match is finally adopted only if there is
 * no better match at the next window position.
 */
const deflate_slow = (s, flush) => {

  let hash_head;          /* head of hash chain */
  let bflush;              /* set if current block must be flushed */

  let max_insert;

  /* Process the input block. */
  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) { break; } /* flush the current block */
    }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
    hash_head = 0/*NIL*/;
    if (s.lookahead >= MIN_MATCH$1) {
      /*** INSERT_STRING(s, s.strstart, hash_head); ***/
      s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH$1 - 1]);
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
      /***/
    }

    /* Find the longest match, discarding those <= prev_length.
     */
    s.prev_length = s.match_length;
    s.prev_match = s.match_start;
    s.match_length = MIN_MATCH$1 - 1;

    if (hash_head !== 0/*NIL*/ && s.prev_length < s.max_lazy_match &&
        s.strstart - hash_head <= (s.w_size - MIN_LOOKAHEAD)/*MAX_DIST(s)*/) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
      s.match_length = longest_match(s, hash_head);
      /* longest_match() sets match_start */

      if (s.match_length <= 5 &&
         (s.strategy === Z_FILTERED || (s.match_length === MIN_MATCH$1 && s.strstart - s.match_start > 4096/*TOO_FAR*/))) {

        /* If prev_match is also MIN_MATCH, match_start is garbage
         * but we will ignore the current match anyway.
         */
        s.match_length = MIN_MATCH$1 - 1;
      }
    }
    /* If there was a match at the previous step and the current
     * match is not better, output the previous match:
     */
    if (s.prev_length >= MIN_MATCH$1 && s.match_length <= s.prev_length) {
      max_insert = s.strstart + s.lookahead - MIN_MATCH$1;
      /* Do not insert strings in hash table beyond this. */

      //check_match(s, s.strstart-1, s.prev_match, s.prev_length);

      /***_tr_tally_dist(s, s.strstart - 1 - s.prev_match,
                     s.prev_length - MIN_MATCH, bflush);***/
      bflush = _tr_tally$1(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH$1);
      /* Insert in hash table all strings up to the end of the match.
       * strstart-1 and strstart are already inserted. If there is not
       * enough lookahead, the last two strings are not inserted in
       * the hash table.
       */
      s.lookahead -= s.prev_length - 1;
      s.prev_length -= 2;
      do {
        if (++s.strstart <= max_insert) {
          /*** INSERT_STRING(s, s.strstart, hash_head); ***/
          s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH$1 - 1]);
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
          /***/
        }
      } while (--s.prev_length !== 0);
      s.match_available = 0;
      s.match_length = MIN_MATCH$1 - 1;
      s.strstart++;

      if (bflush) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/
      }

    } else if (s.match_available) {
      /* If there was no match at the previous position, output a
       * single literal. If there was a match but the current match
       * is longer, truncate the previous match to a single literal.
       */
      //Tracevv((stderr,"%c", s->window[s->strstart-1]));
      /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
      bflush = _tr_tally$1(s, 0, s.window[s.strstart - 1]);

      if (bflush) {
        /*** FLUSH_BLOCK_ONLY(s, 0) ***/
        flush_block_only(s, false);
        /***/
      }
      s.strstart++;
      s.lookahead--;
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    } else {
      /* There is no previous match to compare with, wait for
       * the next step to decide.
       */
      s.match_available = 1;
      s.strstart++;
      s.lookahead--;
    }
  }
  //Assert (flush != Z_NO_FLUSH, "no flush?");
  if (s.match_available) {
    //Tracevv((stderr,"%c", s->window[s->strstart-1]));
    /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
    bflush = _tr_tally$1(s, 0, s.window[s.strstart - 1]);

    s.match_available = 0;
  }
  s.insert = s.strstart < MIN_MATCH$1 - 1 ? s.strstart : MIN_MATCH$1 - 1;
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }

  return BS_BLOCK_DONE;
};


/* ===========================================================================
 * For Z_RLE, simply look for runs of bytes, generate matches only of distance
 * one.  Do not maintain a hash table.  (It will be regenerated if this run of
 * deflate switches away from Z_RLE.)
 */
const deflate_rle = (s, flush) => {

  let bflush;            /* set if current block must be flushed */
  let prev;              /* byte at distance one to match */
  let scan, strend;      /* scan goes up to strend for length of run */

  const _win = s.window;

  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the longest run, plus one for the unrolled loop.
     */
    if (s.lookahead <= MAX_MATCH$1) {
      fill_window(s);
      if (s.lookahead <= MAX_MATCH$1 && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) { break; } /* flush the current block */
    }

    /* See how many times the previous byte repeats */
    s.match_length = 0;
    if (s.lookahead >= MIN_MATCH$1 && s.strstart > 0) {
      scan = s.strstart - 1;
      prev = _win[scan];
      if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
        strend = s.strstart + MAX_MATCH$1;
        do {
          /*jshint noempty:false*/
        } while (prev === _win[++scan] && prev === _win[++scan] &&
                 prev === _win[++scan] && prev === _win[++scan] &&
                 prev === _win[++scan] && prev === _win[++scan] &&
                 prev === _win[++scan] && prev === _win[++scan] &&
                 scan < strend);
        s.match_length = MAX_MATCH$1 - (strend - scan);
        if (s.match_length > s.lookahead) {
          s.match_length = s.lookahead;
        }
      }
      //Assert(scan <= s->window+(uInt)(s->window_size-1), "wild scan");
    }

    /* Emit match if have run of MIN_MATCH or longer, else emit literal */
    if (s.match_length >= MIN_MATCH$1) {
      //check_match(s, s.strstart, s.strstart - 1, s.match_length);

      /*** _tr_tally_dist(s, 1, s.match_length - MIN_MATCH, bflush); ***/
      bflush = _tr_tally$1(s, 1, s.match_length - MIN_MATCH$1);

      s.lookahead -= s.match_length;
      s.strstart += s.match_length;
      s.match_length = 0;
    } else {
      /* No match, output a literal byte */
      //Tracevv((stderr,"%c", s->window[s->strstart]));
      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = _tr_tally$1(s, 0, s.window[s.strstart]);

      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
};

/* ===========================================================================
 * For Z_HUFFMAN_ONLY, do not look for matches.  Do not maintain a hash table.
 * (It will be regenerated if this run of deflate switches away from Huffman.)
 */
const deflate_huff = (s, flush) => {

  let bflush;             /* set if current block must be flushed */

  for (;;) {
    /* Make sure that we have a literal to write. */
    if (s.lookahead === 0) {
      fill_window(s);
      if (s.lookahead === 0) {
        if (flush === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        break;      /* flush the current block */
      }
    }

    /* Output a literal byte */
    s.match_length = 0;
    //Tracevv((stderr,"%c", s->window[s->strstart]));
    /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
    bflush = _tr_tally$1(s, 0, s.window[s.strstart]);
    s.lookahead--;
    s.strstart++;
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
};

/* Values for max_lazy_match, good_match and max_chain_length, depending on
 * the desired pack level (0..9). The values given below have been tuned to
 * exclude worst case performance for pathological files. Better values may be
 * found for specific files.
 */
function Config(good_length, max_lazy, nice_length, max_chain, func) {

  this.good_length = good_length;
  this.max_lazy = max_lazy;
  this.nice_length = nice_length;
  this.max_chain = max_chain;
  this.func = func;
}

const configuration_table = [
  /*      good lazy nice chain */
  new Config(0, 0, 0, 0, deflate_stored),          /* 0 store only */
  new Config(4, 4, 8, 4, deflate_fast),            /* 1 max speed, no lazy matches */
  new Config(4, 5, 16, 8, deflate_fast),           /* 2 */
  new Config(4, 6, 32, 32, deflate_fast),          /* 3 */

  new Config(4, 4, 16, 16, deflate_slow),          /* 4 lazy matches */
  new Config(8, 16, 32, 32, deflate_slow),         /* 5 */
  new Config(8, 16, 128, 128, deflate_slow),       /* 6 */
  new Config(8, 32, 128, 256, deflate_slow),       /* 7 */
  new Config(32, 128, 258, 1024, deflate_slow),    /* 8 */
  new Config(32, 258, 258, 4096, deflate_slow)     /* 9 max compression */
];


/* ===========================================================================
 * Initialize the "longest match" routines for a new zlib stream
 */
const lm_init = (s) => {

  s.window_size = 2 * s.w_size;

  /*** CLEAR_HASH(s); ***/
  zero$1(s.head); // Fill with NIL (= 0);

  /* Set the default configuration parameters:
   */
  s.max_lazy_match = configuration_table[s.level].max_lazy;
  s.good_match = configuration_table[s.level].good_length;
  s.nice_match = configuration_table[s.level].nice_length;
  s.max_chain_length = configuration_table[s.level].max_chain;

  s.strstart = 0;
  s.block_start = 0;
  s.lookahead = 0;
  s.insert = 0;
  s.match_length = s.prev_length = MIN_MATCH$1 - 1;
  s.match_available = 0;
  s.ins_h = 0;
};


function DeflateState() {
  this.strm = null;            /* pointer back to this zlib stream */
  this.status = 0;            /* as the name implies */
  this.pending_buf = null;      /* output still pending */
  this.pending_buf_size = 0;  /* size of pending_buf */
  this.pending_out = 0;       /* next pending byte to output to the stream */
  this.pending = 0;           /* nb of bytes in the pending buffer */
  this.wrap = 0;              /* bit 0 true for zlib, bit 1 true for gzip */
  this.gzhead = null;         /* gzip header information to write */
  this.gzindex = 0;           /* where in extra, name, or comment */
  this.method = Z_DEFLATED; /* can only be DEFLATED */
  this.last_flush = -1;   /* value of flush param for previous deflate call */

  this.w_size = 0;  /* LZ77 window size (32K by default) */
  this.w_bits = 0;  /* log2(w_size)  (8..16) */
  this.w_mask = 0;  /* w_size - 1 */

  this.window = null;
  /* Sliding window. Input bytes are read into the second half of the window,
   * and move to the first half later to keep a dictionary of at least wSize
   * bytes. With this organization, matches are limited to a distance of
   * wSize-MAX_MATCH bytes, but this ensures that IO is always
   * performed with a length multiple of the block size.
   */

  this.window_size = 0;
  /* Actual size of window: 2*wSize, except when the user input buffer
   * is directly used as sliding window.
   */

  this.prev = null;
  /* Link to older string with same hash index. To limit the size of this
   * array to 64K, this link is maintained only for the last 32K strings.
   * An index in this array is thus a window index modulo 32K.
   */

  this.head = null;   /* Heads of the hash chains or NIL. */

  this.ins_h = 0;       /* hash index of string to be inserted */
  this.hash_size = 0;   /* number of elements in hash table */
  this.hash_bits = 0;   /* log2(hash_size) */
  this.hash_mask = 0;   /* hash_size-1 */

  this.hash_shift = 0;
  /* Number of bits by which ins_h must be shifted at each input
   * step. It must be such that after MIN_MATCH steps, the oldest
   * byte no longer takes part in the hash key, that is:
   *   hash_shift * MIN_MATCH >= hash_bits
   */

  this.block_start = 0;
  /* Window position at the beginning of the current output block. Gets
   * negative when the window is moved backwards.
   */

  this.match_length = 0;      /* length of best match */
  this.prev_match = 0;        /* previous match */
  this.match_available = 0;   /* set if previous match exists */
  this.strstart = 0;          /* start of string to insert */
  this.match_start = 0;       /* start of matching string */
  this.lookahead = 0;         /* number of valid bytes ahead in window */

  this.prev_length = 0;
  /* Length of the best match at previous step. Matches not greater than this
   * are discarded. This is used in the lazy match evaluation.
   */

  this.max_chain_length = 0;
  /* To speed up deflation, hash chains are never searched beyond this
   * length.  A higher limit improves compression ratio but degrades the
   * speed.
   */

  this.max_lazy_match = 0;
  /* Attempt to find a better match only when the current match is strictly
   * smaller than this value. This mechanism is used only for compression
   * levels >= 4.
   */
  // That's alias to max_lazy_match, don't use directly
  //this.max_insert_length = 0;
  /* Insert new strings in the hash table only if the match length is not
   * greater than this length. This saves time but degrades compression.
   * max_insert_length is used only for compression levels <= 3.
   */

  this.level = 0;     /* compression level (1..9) */
  this.strategy = 0;  /* favor or force Huffman coding*/

  this.good_match = 0;
  /* Use a faster search when the previous match is longer than this */

  this.nice_match = 0; /* Stop searching when current match exceeds this */

              /* used by trees.c: */

  /* Didn't use ct_data typedef below to suppress compiler warning */

  // struct ct_data_s dyn_ltree[HEAP_SIZE];   /* literal and length tree */
  // struct ct_data_s dyn_dtree[2*D_CODES+1]; /* distance tree */
  // struct ct_data_s bl_tree[2*BL_CODES+1];  /* Huffman tree for bit lengths */

  // Use flat array of DOUBLE size, with interleaved fata,
  // because JS does not support effective
  this.dyn_ltree  = new Uint16Array(HEAP_SIZE$1 * 2);
  this.dyn_dtree  = new Uint16Array((2 * D_CODES$1 + 1) * 2);
  this.bl_tree    = new Uint16Array((2 * BL_CODES$1 + 1) * 2);
  zero$1(this.dyn_ltree);
  zero$1(this.dyn_dtree);
  zero$1(this.bl_tree);

  this.l_desc   = null;         /* desc. for literal tree */
  this.d_desc   = null;         /* desc. for distance tree */
  this.bl_desc  = null;         /* desc. for bit length tree */

  //ush bl_count[MAX_BITS+1];
  this.bl_count = new Uint16Array(MAX_BITS$1 + 1);
  /* number of codes at each bit length for an optimal tree */

  //int heap[2*L_CODES+1];      /* heap used to build the Huffman trees */
  this.heap = new Uint16Array(2 * L_CODES$1 + 1);  /* heap used to build the Huffman trees */
  zero$1(this.heap);

  this.heap_len = 0;               /* number of elements in the heap */
  this.heap_max = 0;               /* element of largest frequency */
  /* The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.
   * The same heap array is used to build all trees.
   */

  this.depth = new Uint16Array(2 * L_CODES$1 + 1); //uch depth[2*L_CODES+1];
  zero$1(this.depth);
  /* Depth of each subtree used as tie breaker for trees of equal frequency
   */

  this.l_buf = 0;          /* buffer index for literals or lengths */

  this.lit_bufsize = 0;
  /* Size of match buffer for literals/lengths.  There are 4 reasons for
   * limiting lit_bufsize to 64K:
   *   - frequencies can be kept in 16 bit counters
   *   - if compression is not successful for the first block, all input
   *     data is still in the window so we can still emit a stored block even
   *     when input comes from standard input.  (This can also be done for
   *     all blocks if lit_bufsize is not greater than 32K.)
   *   - if compression is not successful for a file smaller than 64K, we can
   *     even emit a stored file instead of a stored block (saving 5 bytes).
   *     This is applicable only for zip (not gzip or zlib).
   *   - creating new Huffman trees less frequently may not provide fast
   *     adaptation to changes in the input data statistics. (Take for
   *     example a binary file with poorly compressible code followed by
   *     a highly compressible string table.) Smaller buffer sizes give
   *     fast adaptation but have of course the overhead of transmitting
   *     trees more frequently.
   *   - I can't count above 4
   */

  this.last_lit = 0;      /* running index in l_buf */

  this.d_buf = 0;
  /* Buffer index for distances. To simplify the code, d_buf and l_buf have
   * the same number of elements. To use different lengths, an extra flag
   * array would be necessary.
   */

  this.opt_len = 0;       /* bit length of current block with optimal trees */
  this.static_len = 0;    /* bit length of current block with static trees */
  this.matches = 0;       /* number of string matches in current block */
  this.insert = 0;        /* bytes at end of window left to insert */


  this.bi_buf = 0;
  /* Output buffer. bits are inserted starting at the bottom (least
   * significant bits).
   */
  this.bi_valid = 0;
  /* Number of valid bits in bi_buf.  All bits above the last valid bit
   * are always zero.
   */

  // Used for window memory init. We safely ignore it for JS. That makes
  // sense only for pointers and memory check tools.
  //this.high_water = 0;
  /* High water mark offset in window for initialized bytes -- bytes above
   * this are set to zero in order to avoid memory check warnings when
   * longest match routines access bytes past the input.  This is then
   * updated to the new high water mark.
   */
}


const deflateResetKeep = (strm) => {

  if (!strm || !strm.state) {
    return err(strm, Z_STREAM_ERROR);
  }

  strm.total_in = strm.total_out = 0;
  strm.data_type = Z_UNKNOWN$1;

  const s = strm.state;
  s.pending = 0;
  s.pending_out = 0;

  if (s.wrap < 0) {
    s.wrap = -s.wrap;
    /* was made negative by deflate(..., Z_FINISH); */
  }
  s.status = (s.wrap ? INIT_STATE : BUSY_STATE);
  strm.adler = (s.wrap === 2) ?
    0  // crc32(0, Z_NULL, 0)
  :
    1; // adler32(0, Z_NULL, 0)
  s.last_flush = Z_NO_FLUSH;
  _tr_init$1(s);
  return Z_OK;
};


const deflateReset = (strm) => {

  const ret = deflateResetKeep(strm);
  if (ret === Z_OK) {
    lm_init(strm.state);
  }
  return ret;
};


const deflateSetHeader = (strm, head) => {

  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  if (strm.state.wrap !== 2) { return Z_STREAM_ERROR; }
  strm.state.gzhead = head;
  return Z_OK;
};


const deflateInit2 = (strm, level, method, windowBits, memLevel, strategy) => {

  if (!strm) { // === Z_NULL
    return Z_STREAM_ERROR;
  }
  let wrap = 1;

  if (level === Z_DEFAULT_COMPRESSION) {
    level = 6;
  }

  if (windowBits < 0) { /* suppress zlib wrapper */
    wrap = 0;
    windowBits = -windowBits;
  }

  else if (windowBits > 15) {
    wrap = 2;           /* write gzip wrapper instead */
    windowBits -= 16;
  }


  if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED ||
    windowBits < 8 || windowBits > 15 || level < 0 || level > 9 ||
    strategy < 0 || strategy > Z_FIXED$1) {
    return err(strm, Z_STREAM_ERROR);
  }


  if (windowBits === 8) {
    windowBits = 9;
  }
  /* until 256-byte window bug fixed */

  const s = new DeflateState();

  strm.state = s;
  s.strm = strm;

  s.wrap = wrap;
  s.gzhead = null;
  s.w_bits = windowBits;
  s.w_size = 1 << s.w_bits;
  s.w_mask = s.w_size - 1;

  s.hash_bits = memLevel + 7;
  s.hash_size = 1 << s.hash_bits;
  s.hash_mask = s.hash_size - 1;
  s.hash_shift = ~~((s.hash_bits + MIN_MATCH$1 - 1) / MIN_MATCH$1);

  s.window = new Uint8Array(s.w_size * 2);
  s.head = new Uint16Array(s.hash_size);
  s.prev = new Uint16Array(s.w_size);

  // Don't need mem init magic for JS.
  //s.high_water = 0;  /* nothing written to s->window yet */

  s.lit_bufsize = 1 << (memLevel + 6); /* 16K elements by default */

  s.pending_buf_size = s.lit_bufsize * 4;

  //overlay = (ushf *) ZALLOC(strm, s->lit_bufsize, sizeof(ush)+2);
  //s->pending_buf = (uchf *) overlay;
  s.pending_buf = new Uint8Array(s.pending_buf_size);

  // It is offset from `s.pending_buf` (size is `s.lit_bufsize * 2`)
  //s->d_buf = overlay + s->lit_bufsize/sizeof(ush);
  s.d_buf = 1 * s.lit_bufsize;

  //s->l_buf = s->pending_buf + (1+sizeof(ush))*s->lit_bufsize;
  s.l_buf = (1 + 2) * s.lit_bufsize;

  s.level = level;
  s.strategy = strategy;
  s.method = method;

  return deflateReset(strm);
};

const deflateInit = (strm, level) => {

  return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
};


const deflate = (strm, flush) => {

  let beg, val; // for gzip header write only

  if (!strm || !strm.state ||
    flush > Z_BLOCK || flush < 0) {
    return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
  }

  const s = strm.state;

  if (!strm.output ||
      (!strm.input && strm.avail_in !== 0) ||
      (s.status === FINISH_STATE && flush !== Z_FINISH)) {
    return err(strm, (strm.avail_out === 0) ? Z_BUF_ERROR : Z_STREAM_ERROR);
  }

  s.strm = strm; /* just in case */
  const old_flush = s.last_flush;
  s.last_flush = flush;

  /* Write the header */
  if (s.status === INIT_STATE) {

    if (s.wrap === 2) { // GZIP header
      strm.adler = 0;  //crc32(0L, Z_NULL, 0);
      put_byte(s, 31);
      put_byte(s, 139);
      put_byte(s, 8);
      if (!s.gzhead) { // s->gzhead == Z_NULL
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, s.level === 9 ? 2 :
                    (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ?
                     4 : 0));
        put_byte(s, OS_CODE);
        s.status = BUSY_STATE;
      }
      else {
        put_byte(s, (s.gzhead.text ? 1 : 0) +
                    (s.gzhead.hcrc ? 2 : 0) +
                    (!s.gzhead.extra ? 0 : 4) +
                    (!s.gzhead.name ? 0 : 8) +
                    (!s.gzhead.comment ? 0 : 16)
        );
        put_byte(s, s.gzhead.time & 0xff);
        put_byte(s, (s.gzhead.time >> 8) & 0xff);
        put_byte(s, (s.gzhead.time >> 16) & 0xff);
        put_byte(s, (s.gzhead.time >> 24) & 0xff);
        put_byte(s, s.level === 9 ? 2 :
                    (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ?
                     4 : 0));
        put_byte(s, s.gzhead.os & 0xff);
        if (s.gzhead.extra && s.gzhead.extra.length) {
          put_byte(s, s.gzhead.extra.length & 0xff);
          put_byte(s, (s.gzhead.extra.length >> 8) & 0xff);
        }
        if (s.gzhead.hcrc) {
          strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending, 0);
        }
        s.gzindex = 0;
        s.status = EXTRA_STATE;
      }
    }
    else // DEFLATE header
    {
      let header = (Z_DEFLATED + ((s.w_bits - 8) << 4)) << 8;
      let level_flags = -1;

      if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
        level_flags = 0;
      } else if (s.level < 6) {
        level_flags = 1;
      } else if (s.level === 6) {
        level_flags = 2;
      } else {
        level_flags = 3;
      }
      header |= (level_flags << 6);
      if (s.strstart !== 0) { header |= PRESET_DICT; }
      header += 31 - (header % 31);

      s.status = BUSY_STATE;
      putShortMSB(s, header);

      /* Save the adler32 of the preset dictionary: */
      if (s.strstart !== 0) {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 0xffff);
      }
      strm.adler = 1; // adler32(0L, Z_NULL, 0);
    }
  }

//#ifdef GZIP
  if (s.status === EXTRA_STATE) {
    if (s.gzhead.extra/* != Z_NULL*/) {
      beg = s.pending;  /* start of bytes to update crc */

      while (s.gzindex < (s.gzhead.extra.length & 0xffff)) {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            break;
          }
        }
        put_byte(s, s.gzhead.extra[s.gzindex] & 0xff);
        s.gzindex++;
      }
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (s.gzindex === s.gzhead.extra.length) {
        s.gzindex = 0;
        s.status = NAME_STATE;
      }
    }
    else {
      s.status = NAME_STATE;
    }
  }
  if (s.status === NAME_STATE) {
    if (s.gzhead.name/* != Z_NULL*/) {
      beg = s.pending;  /* start of bytes to update crc */
      //int val;

      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        // JS specific: little magic to add zero terminator to end of string
        if (s.gzindex < s.gzhead.name.length) {
          val = s.gzhead.name.charCodeAt(s.gzindex++) & 0xff;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);

      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.gzindex = 0;
        s.status = COMMENT_STATE;
      }
    }
    else {
      s.status = COMMENT_STATE;
    }
  }
  if (s.status === COMMENT_STATE) {
    if (s.gzhead.comment/* != Z_NULL*/) {
      beg = s.pending;  /* start of bytes to update crc */
      //int val;

      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        // JS specific: little magic to add zero terminator to end of string
        if (s.gzindex < s.gzhead.comment.length) {
          val = s.gzhead.comment.charCodeAt(s.gzindex++) & 0xff;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);

      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.status = HCRC_STATE;
      }
    }
    else {
      s.status = HCRC_STATE;
    }
  }
  if (s.status === HCRC_STATE) {
    if (s.gzhead.hcrc) {
      if (s.pending + 2 > s.pending_buf_size) {
        flush_pending(strm);
      }
      if (s.pending + 2 <= s.pending_buf_size) {
        put_byte(s, strm.adler & 0xff);
        put_byte(s, (strm.adler >> 8) & 0xff);
        strm.adler = 0; //crc32(0L, Z_NULL, 0);
        s.status = BUSY_STATE;
      }
    }
    else {
      s.status = BUSY_STATE;
    }
  }
//#endif

  /* Flush as much pending output as possible */
  if (s.pending !== 0) {
    flush_pending(strm);
    if (strm.avail_out === 0) {
      /* Since avail_out is 0, deflate will be called again with
       * more output space, but possibly with both pending and
       * avail_in equal to zero. There won't be anything to do,
       * but this is not an error situation so make sure we
       * return OK instead of BUF_ERROR at next call of deflate:
       */
      s.last_flush = -1;
      return Z_OK;
    }

    /* Make sure there is something to do and avoid duplicate consecutive
     * flushes. For repeated and useless calls with Z_FINISH, we keep
     * returning Z_STREAM_END instead of Z_BUF_ERROR.
     */
  } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) &&
    flush !== Z_FINISH) {
    return err(strm, Z_BUF_ERROR);
  }

  /* User must not provide more input after the first FINISH: */
  if (s.status === FINISH_STATE && strm.avail_in !== 0) {
    return err(strm, Z_BUF_ERROR);
  }

  /* Start a new block or continue the current one.
   */
  if (strm.avail_in !== 0 || s.lookahead !== 0 ||
    (flush !== Z_NO_FLUSH && s.status !== FINISH_STATE)) {
    let bstate = (s.strategy === Z_HUFFMAN_ONLY) ? deflate_huff(s, flush) :
      (s.strategy === Z_RLE ? deflate_rle(s, flush) :
        configuration_table[s.level].func(s, flush));

    if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
      s.status = FINISH_STATE;
    }
    if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        /* avoid BUF_ERROR next call, see above */
      }
      return Z_OK;
      /* If flush != Z_NO_FLUSH && avail_out == 0, the next call
       * of deflate should use the same flush parameter to make sure
       * that the flush is complete. So we don't have to output an
       * empty block here, this will be done at next call. This also
       * ensures that for a very small output buffer, we emit at most
       * one empty block.
       */
    }
    if (bstate === BS_BLOCK_DONE) {
      if (flush === Z_PARTIAL_FLUSH) {
        _tr_align$1(s);
      }
      else if (flush !== Z_BLOCK) { /* FULL_FLUSH or SYNC_FLUSH */

        _tr_stored_block$1(s, 0, 0, false);
        /* For a full flush, this empty block will be recognized
         * as a special marker by inflate_sync().
         */
        if (flush === Z_FULL_FLUSH) {
          /*** CLEAR_HASH(s); ***/             /* forget history */
          zero$1(s.head); // Fill with NIL (= 0);

          if (s.lookahead === 0) {
            s.strstart = 0;
            s.block_start = 0;
            s.insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1; /* avoid BUF_ERROR at next call, see above */
        return Z_OK;
      }
    }
  }
  //Assert(strm->avail_out > 0, "bug2");
  //if (strm.avail_out <= 0) { throw new Error("bug2");}

  if (flush !== Z_FINISH) { return Z_OK; }
  if (s.wrap <= 0) { return Z_STREAM_END; }

  /* Write the trailer */
  if (s.wrap === 2) {
    put_byte(s, strm.adler & 0xff);
    put_byte(s, (strm.adler >> 8) & 0xff);
    put_byte(s, (strm.adler >> 16) & 0xff);
    put_byte(s, (strm.adler >> 24) & 0xff);
    put_byte(s, strm.total_in & 0xff);
    put_byte(s, (strm.total_in >> 8) & 0xff);
    put_byte(s, (strm.total_in >> 16) & 0xff);
    put_byte(s, (strm.total_in >> 24) & 0xff);
  }
  else
  {
    putShortMSB(s, strm.adler >>> 16);
    putShortMSB(s, strm.adler & 0xffff);
  }

  flush_pending(strm);
  /* If avail_out is zero, the application will call deflate again
   * to flush the rest.
   */
  if (s.wrap > 0) { s.wrap = -s.wrap; }
  /* write the trailer only once! */
  return s.pending !== 0 ? Z_OK : Z_STREAM_END;
};


const deflateEnd = (strm) => {

  if (!strm/*== Z_NULL*/ || !strm.state/*== Z_NULL*/) {
    return Z_STREAM_ERROR;
  }

  const status = strm.state.status;
  if (status !== INIT_STATE &&
    status !== EXTRA_STATE &&
    status !== NAME_STATE &&
    status !== COMMENT_STATE &&
    status !== HCRC_STATE &&
    status !== BUSY_STATE &&
    status !== FINISH_STATE
  ) {
    return err(strm, Z_STREAM_ERROR);
  }

  strm.state = null;

  return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
};


/* =========================================================================
 * Initializes the compression dictionary from the given byte
 * sequence without producing any compressed output.
 */
const deflateSetDictionary = (strm, dictionary) => {

  let dictLength = dictionary.length;

  if (!strm/*== Z_NULL*/ || !strm.state/*== Z_NULL*/) {
    return Z_STREAM_ERROR;
  }

  const s = strm.state;
  const wrap = s.wrap;

  if (wrap === 2 || (wrap === 1 && s.status !== INIT_STATE) || s.lookahead) {
    return Z_STREAM_ERROR;
  }

  /* when using zlib wrappers, compute Adler-32 for provided dictionary */
  if (wrap === 1) {
    /* adler32(strm->adler, dictionary, dictLength); */
    strm.adler = adler32_1(strm.adler, dictionary, dictLength, 0);
  }

  s.wrap = 0;   /* avoid computing Adler-32 in read_buf */

  /* if dictionary would fill window, just replace the history */
  if (dictLength >= s.w_size) {
    if (wrap === 0) {            /* already empty otherwise */
      /*** CLEAR_HASH(s); ***/
      zero$1(s.head); // Fill with NIL (= 0);
      s.strstart = 0;
      s.block_start = 0;
      s.insert = 0;
    }
    /* use the tail */
    // dictionary = dictionary.slice(dictLength - s.w_size);
    let tmpDict = new Uint8Array(s.w_size);
    tmpDict.set(dictionary.subarray(dictLength - s.w_size, dictLength), 0);
    dictionary = tmpDict;
    dictLength = s.w_size;
  }
  /* insert dictionary into window and hash */
  const avail = strm.avail_in;
  const next = strm.next_in;
  const input = strm.input;
  strm.avail_in = dictLength;
  strm.next_in = 0;
  strm.input = dictionary;
  fill_window(s);
  while (s.lookahead >= MIN_MATCH$1) {
    let str = s.strstart;
    let n = s.lookahead - (MIN_MATCH$1 - 1);
    do {
      /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
      s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH$1 - 1]);

      s.prev[str & s.w_mask] = s.head[s.ins_h];

      s.head[s.ins_h] = str;
      str++;
    } while (--n);
    s.strstart = str;
    s.lookahead = MIN_MATCH$1 - 1;
    fill_window(s);
  }
  s.strstart += s.lookahead;
  s.block_start = s.strstart;
  s.insert = s.lookahead;
  s.lookahead = 0;
  s.match_length = s.prev_length = MIN_MATCH$1 - 1;
  s.match_available = 0;
  strm.next_in = next;
  strm.input = input;
  strm.avail_in = avail;
  s.wrap = wrap;
  return Z_OK;
};


var deflateInit_1 = deflateInit;
var deflateInit2_1 = deflateInit2;
var deflateReset_1 = deflateReset;
var deflateResetKeep_1 = deflateResetKeep;
var deflateSetHeader_1 = deflateSetHeader;
var deflate_2 = deflate;
var deflateEnd_1 = deflateEnd;
var deflateSetDictionary_1 = deflateSetDictionary;
var deflateInfo = 'pako deflate (from Nodeca project)';

/* Not implemented
module.exports.deflateBound = deflateBound;
module.exports.deflateCopy = deflateCopy;
module.exports.deflateParams = deflateParams;
module.exports.deflatePending = deflatePending;
module.exports.deflatePrime = deflatePrime;
module.exports.deflateTune = deflateTune;
*/

var deflate_1 = {
	deflateInit: deflateInit_1,
	deflateInit2: deflateInit2_1,
	deflateReset: deflateReset_1,
	deflateResetKeep: deflateResetKeep_1,
	deflateSetHeader: deflateSetHeader_1,
	deflate: deflate_2,
	deflateEnd: deflateEnd_1,
	deflateSetDictionary: deflateSetDictionary_1,
	deflateInfo: deflateInfo
};

const _has = (obj, key) => {
  return Object.prototype.hasOwnProperty.call(obj, key);
};

var assign = function (obj /*from1, from2, from3, ...*/) {
  const sources = Array.prototype.slice.call(arguments, 1);
  while (sources.length) {
    const source = sources.shift();
    if (!source) { continue; }

    if (typeof source !== 'object') {
      throw new TypeError(source + 'must be non-object');
    }

    for (const p in source) {
      if (_has(source, p)) {
        obj[p] = source[p];
      }
    }
  }

  return obj;
};


// Join array of chunks to single array.
var flattenChunks = (chunks) => {
  // calculate data length
  let len = 0;

  for (let i = 0, l = chunks.length; i < l; i++) {
    len += chunks[i].length;
  }

  // join chunks
  const result = new Uint8Array(len);

  for (let i = 0, pos = 0, l = chunks.length; i < l; i++) {
    let chunk = chunks[i];
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
};

var common = {
	assign: assign,
	flattenChunks: flattenChunks
};

// String encode/decode helpers


// Quick check if we can use fast array to bin string conversion
//
// - apply(Array) can fail on Android 2.2
// - apply(Uint8Array) can fail on iOS 5.1 Safari
//
let STR_APPLY_UIA_OK = true;

try { String.fromCharCode.apply(null, new Uint8Array(1)); } catch (__) { STR_APPLY_UIA_OK = false; }


// Table with utf8 lengths (calculated by first byte of sequence)
// Note, that 5 & 6-byte values and some 4-byte values can not be represented in JS,
// because max possible codepoint is 0x10ffff
const _utf8len = new Uint8Array(256);
for (let q = 0; q < 256; q++) {
  _utf8len[q] = (q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1);
}
_utf8len[254] = _utf8len[254] = 1; // Invalid sequence start


// convert string to array (typed, when possible)
var string2buf = (str) => {
  let buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;

  // count binary size
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 0xfc00) === 0xd800 && (m_pos + 1 < str_len)) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 0xfc00) === 0xdc00) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        m_pos++;
      }
    }
    buf_len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  // allocate buffer
  buf = new Uint8Array(buf_len);

  // convert
  for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 0xfc00) === 0xd800 && (m_pos + 1 < str_len)) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 0xfc00) === 0xdc00) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        m_pos++;
      }
    }
    if (c < 0x80) {
      /* one byte */
      buf[i++] = c;
    } else if (c < 0x800) {
      /* two bytes */
      buf[i++] = 0xC0 | (c >>> 6);
      buf[i++] = 0x80 | (c & 0x3f);
    } else if (c < 0x10000) {
      /* three bytes */
      buf[i++] = 0xE0 | (c >>> 12);
      buf[i++] = 0x80 | (c >>> 6 & 0x3f);
      buf[i++] = 0x80 | (c & 0x3f);
    } else {
      /* four bytes */
      buf[i++] = 0xf0 | (c >>> 18);
      buf[i++] = 0x80 | (c >>> 12 & 0x3f);
      buf[i++] = 0x80 | (c >>> 6 & 0x3f);
      buf[i++] = 0x80 | (c & 0x3f);
    }
  }

  return buf;
};

// Helper
const buf2binstring = (buf, len) => {
  // On Chrome, the arguments in a function call that are allowed is `65534`.
  // If the length of the buffer is smaller than that, we can use this optimization,
  // otherwise we will take a slower path.
  if (len < 65534) {
    if (buf.subarray && STR_APPLY_UIA_OK) {
      return String.fromCharCode.apply(null, buf.length === len ? buf : buf.subarray(0, len));
    }
  }

  let result = '';
  for (let i = 0; i < len; i++) {
    result += String.fromCharCode(buf[i]);
  }
  return result;
};


// convert array to string
var buf2string = (buf, max) => {
  let i, out;
  const len = max || buf.length;

  // Reserve max possible length (2 words per char)
  // NB: by unknown reasons, Array is significantly faster for
  //     String.fromCharCode.apply than Uint16Array.
  const utf16buf = new Array(len * 2);

  for (out = 0, i = 0; i < len;) {
    let c = buf[i++];
    // quick process ascii
    if (c < 0x80) { utf16buf[out++] = c; continue; }

    let c_len = _utf8len[c];
    // skip 5 & 6 byte codes
    if (c_len > 4) { utf16buf[out++] = 0xfffd; i += c_len - 1; continue; }

    // apply mask on first byte
    c &= c_len === 2 ? 0x1f : c_len === 3 ? 0x0f : 0x07;
    // join the rest
    while (c_len > 1 && i < len) {
      c = (c << 6) | (buf[i++] & 0x3f);
      c_len--;
    }

    // terminated by end of string?
    if (c_len > 1) { utf16buf[out++] = 0xfffd; continue; }

    if (c < 0x10000) {
      utf16buf[out++] = c;
    } else {
      c -= 0x10000;
      utf16buf[out++] = 0xd800 | ((c >> 10) & 0x3ff);
      utf16buf[out++] = 0xdc00 | (c & 0x3ff);
    }
  }

  return buf2binstring(utf16buf, out);
};


// Calculate max possible position in utf8 buffer,
// that will not break sequence. If that's not possible
// - (very small limits) return max size as is.
//
// buf[] - utf8 bytes array
// max   - length limit (mandatory);
var utf8border = (buf, max) => {

  max = max || buf.length;
  if (max > buf.length) { max = buf.length; }

  // go back from last position, until start of sequence found
  let pos = max - 1;
  while (pos >= 0 && (buf[pos] & 0xC0) === 0x80) { pos--; }

  // Very small and broken sequence,
  // return max, because we should return something anyway.
  if (pos < 0) { return max; }

  // If we came to start of buffer - that means buffer is too small,
  // return max too.
  if (pos === 0) { return max; }

  return (pos + _utf8len[buf[pos]] > max) ? pos : max;
};

var strings = {
	string2buf: string2buf,
	buf2string: buf2string,
	utf8border: utf8border
};

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

function ZStream() {
  /* next input byte */
  this.input = null; // JS specific, because we have no pointers
  this.next_in = 0;
  /* number of bytes available at input */
  this.avail_in = 0;
  /* total number of input bytes read so far */
  this.total_in = 0;
  /* next output byte should be put there */
  this.output = null; // JS specific, because we have no pointers
  this.next_out = 0;
  /* remaining free space at output */
  this.avail_out = 0;
  /* total number of bytes output so far */
  this.total_out = 0;
  /* last error message, NULL if no error */
  this.msg = ''/*Z_NULL*/;
  /* not visible by applications */
  this.state = null;
  /* best guess about the data type: binary or text */
  this.data_type = 2/*Z_UNKNOWN*/;
  /* adler32 value of the uncompressed data */
  this.adler = 0;
}

var zstream = ZStream;

const toString$1 = Object.prototype.toString;

/* Public constants ==========================================================*/
/* ===========================================================================*/

const {
  Z_NO_FLUSH: Z_NO_FLUSH$1, Z_SYNC_FLUSH, Z_FULL_FLUSH: Z_FULL_FLUSH$1, Z_FINISH: Z_FINISH$1,
  Z_OK: Z_OK$1, Z_STREAM_END: Z_STREAM_END$1,
  Z_DEFAULT_COMPRESSION: Z_DEFAULT_COMPRESSION$1,
  Z_DEFAULT_STRATEGY: Z_DEFAULT_STRATEGY$1,
  Z_DEFLATED: Z_DEFLATED$1
} = constants;

/* ===========================================================================*/


/**
 * class Deflate
 *
 * Generic JS-style wrapper for zlib calls. If you don't need
 * streaming behaviour - use more simple functions: [[deflate]],
 * [[deflateRaw]] and [[gzip]].
 **/

/* internal
 * Deflate.chunks -> Array
 *
 * Chunks of output data, if [[Deflate#onData]] not overridden.
 **/

/**
 * Deflate.result -> Uint8Array
 *
 * Compressed result, generated by default [[Deflate#onData]]
 * and [[Deflate#onEnd]] handlers. Filled after you push last chunk
 * (call [[Deflate#push]] with `Z_FINISH` / `true` param).
 **/

/**
 * Deflate.err -> Number
 *
 * Error code after deflate finished. 0 (Z_OK) on success.
 * You will not need it in real life, because deflate errors
 * are possible only on wrong options or bad `onData` / `onEnd`
 * custom handlers.
 **/

/**
 * Deflate.msg -> String
 *
 * Error message, if [[Deflate.err]] != 0
 **/


/**
 * new Deflate(options)
 * - options (Object): zlib deflate options.
 *
 * Creates new deflator instance with specified params. Throws exception
 * on bad params. Supported options:
 *
 * - `level`
 * - `windowBits`
 * - `memLevel`
 * - `strategy`
 * - `dictionary`
 *
 * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
 * for more information on these.
 *
 * Additional options, for internal needs:
 *
 * - `chunkSize` - size of generated data chunks (16K by default)
 * - `raw` (Boolean) - do raw deflate
 * - `gzip` (Boolean) - create gzip wrapper
 * - `header` (Object) - custom header for gzip
 *   - `text` (Boolean) - true if compressed data believed to be text
 *   - `time` (Number) - modification time, unix timestamp
 *   - `os` (Number) - operation system code
 *   - `extra` (Array) - array of bytes with extra data (max 65536)
 *   - `name` (String) - file name (binary string)
 *   - `comment` (String) - comment (binary string)
 *   - `hcrc` (Boolean) - true if header crc should be added
 *
 * ##### Example:
 *
 * ```javascript
 * const pako = require('pako')
 *   , chunk1 = new Uint8Array([1,2,3,4,5,6,7,8,9])
 *   , chunk2 = new Uint8Array([10,11,12,13,14,15,16,17,18,19]);
 *
 * const deflate = new pako.Deflate({ level: 3});
 *
 * deflate.push(chunk1, false);
 * deflate.push(chunk2, true);  // true -> last chunk
 *
 * if (deflate.err) { throw new Error(deflate.err); }
 *
 * console.log(deflate.result);
 * ```
 **/
function Deflate(options) {
  this.options = common.assign({
    level: Z_DEFAULT_COMPRESSION$1,
    method: Z_DEFLATED$1,
    chunkSize: 16384,
    windowBits: 15,
    memLevel: 8,
    strategy: Z_DEFAULT_STRATEGY$1
  }, options || {});

  let opt = this.options;

  if (opt.raw && (opt.windowBits > 0)) {
    opt.windowBits = -opt.windowBits;
  }

  else if (opt.gzip && (opt.windowBits > 0) && (opt.windowBits < 16)) {
    opt.windowBits += 16;
  }

  this.err    = 0;      // error code, if happens (0 = Z_OK)
  this.msg    = '';     // error message
  this.ended  = false;  // used to avoid multiple onEnd() calls
  this.chunks = [];     // chunks of compressed data

  this.strm = new zstream();
  this.strm.avail_out = 0;

  let status = deflate_1.deflateInit2(
    this.strm,
    opt.level,
    opt.method,
    opt.windowBits,
    opt.memLevel,
    opt.strategy
  );

  if (status !== Z_OK$1) {
    throw new Error(messages[status]);
  }

  if (opt.header) {
    deflate_1.deflateSetHeader(this.strm, opt.header);
  }

  if (opt.dictionary) {
    let dict;
    // Convert data if needed
    if (typeof opt.dictionary === 'string') {
      // If we need to compress text, change encoding to utf8.
      dict = strings.string2buf(opt.dictionary);
    } else if (toString$1.call(opt.dictionary) === '[object ArrayBuffer]') {
      dict = new Uint8Array(opt.dictionary);
    } else {
      dict = opt.dictionary;
    }

    status = deflate_1.deflateSetDictionary(this.strm, dict);

    if (status !== Z_OK$1) {
      throw new Error(messages[status]);
    }

    this._dict_set = true;
  }
}

/**
 * Deflate#push(data[, flush_mode]) -> Boolean
 * - data (Uint8Array|ArrayBuffer|String): input data. Strings will be
 *   converted to utf8 byte sequence.
 * - flush_mode (Number|Boolean): 0..6 for corresponding Z_NO_FLUSH..Z_TREE modes.
 *   See constants. Skipped or `false` means Z_NO_FLUSH, `true` means Z_FINISH.
 *
 * Sends input data to deflate pipe, generating [[Deflate#onData]] calls with
 * new compressed chunks. Returns `true` on success. The last data block must
 * have `flush_mode` Z_FINISH (or `true`). That will flush internal pending
 * buffers and call [[Deflate#onEnd]].
 *
 * On fail call [[Deflate#onEnd]] with error code and return false.
 *
 * ##### Example
 *
 * ```javascript
 * push(chunk, false); // push one of data chunks
 * ...
 * push(chunk, true);  // push last chunk
 * ```
 **/
Deflate.prototype.push = function (data, flush_mode) {
  const strm = this.strm;
  const chunkSize = this.options.chunkSize;
  let status, _flush_mode;

  if (this.ended) { return false; }

  if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;
  else _flush_mode = flush_mode === true ? Z_FINISH$1 : Z_NO_FLUSH$1;

  // Convert data if needed
  if (typeof data === 'string') {
    // If we need to compress text, change encoding to utf8.
    strm.input = strings.string2buf(data);
  } else if (toString$1.call(data) === '[object ArrayBuffer]') {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }

  strm.next_in = 0;
  strm.avail_in = strm.input.length;

  for (;;) {
    if (strm.avail_out === 0) {
      strm.output = new Uint8Array(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }

    // Make sure avail_out > 6 to avoid repeating markers
    if ((_flush_mode === Z_SYNC_FLUSH || _flush_mode === Z_FULL_FLUSH$1) && strm.avail_out <= 6) {
      this.onData(strm.output.subarray(0, strm.next_out));
      strm.avail_out = 0;
      continue;
    }

    status = deflate_1.deflate(strm, _flush_mode);

    // Ended => flush and finish
    if (status === Z_STREAM_END$1) {
      if (strm.next_out > 0) {
        this.onData(strm.output.subarray(0, strm.next_out));
      }
      status = deflate_1.deflateEnd(this.strm);
      this.onEnd(status);
      this.ended = true;
      return status === Z_OK$1;
    }

    // Flush if out buffer full
    if (strm.avail_out === 0) {
      this.onData(strm.output);
      continue;
    }

    // Flush if requested and has data
    if (_flush_mode > 0 && strm.next_out > 0) {
      this.onData(strm.output.subarray(0, strm.next_out));
      strm.avail_out = 0;
      continue;
    }

    if (strm.avail_in === 0) break;
  }

  return true;
};


/**
 * Deflate#onData(chunk) -> Void
 * - chunk (Uint8Array): output data.
 *
 * By default, stores data blocks in `chunks[]` property and glue
 * those in `onEnd`. Override this handler, if you need another behaviour.
 **/
Deflate.prototype.onData = function (chunk) {
  this.chunks.push(chunk);
};


/**
 * Deflate#onEnd(status) -> Void
 * - status (Number): deflate status. 0 (Z_OK) on success,
 *   other if not.
 *
 * Called once after you tell deflate that the input stream is
 * complete (Z_FINISH). By default - join collected chunks,
 * free memory and fill `results` / `err` properties.
 **/
Deflate.prototype.onEnd = function (status) {
  // On success - join
  if (status === Z_OK$1) {
    this.result = common.flattenChunks(this.chunks);
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};


/**
 * deflate(data[, options]) -> Uint8Array
 * - data (Uint8Array|String): input data to compress.
 * - options (Object): zlib deflate options.
 *
 * Compress `data` with deflate algorithm and `options`.
 *
 * Supported options are:
 *
 * - level
 * - windowBits
 * - memLevel
 * - strategy
 * - dictionary
 *
 * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
 * for more information on these.
 *
 * Sugar (options):
 *
 * - `raw` (Boolean) - say that we work with raw stream, if you don't wish to specify
 *   negative windowBits implicitly.
 *
 * ##### Example:
 *
 * ```javascript
 * const pako = require('pako')
 * const data = new Uint8Array([1,2,3,4,5,6,7,8,9]);
 *
 * console.log(pako.deflate(data));
 * ```
 **/
function deflate$1(input, options) {
  const deflator = new Deflate(options);

  deflator.push(input, true);

  // That will never happens, if you don't cheat with options :)
  if (deflator.err) { throw deflator.msg || messages[deflator.err]; }

  return deflator.result;
}


/**
 * deflateRaw(data[, options]) -> Uint8Array
 * - data (Uint8Array|String): input data to compress.
 * - options (Object): zlib deflate options.
 *
 * The same as [[deflate]], but creates raw data, without wrapper
 * (header and adler32 crc).
 **/
function deflateRaw(input, options) {
  options = options || {};
  options.raw = true;
  return deflate$1(input, options);
}


/**
 * gzip(data[, options]) -> Uint8Array
 * - data (Uint8Array|String): input data to compress.
 * - options (Object): zlib deflate options.
 *
 * The same as [[deflate]], but create gzip wrapper instead of
 * deflate one.
 **/
function gzip(input, options) {
  options = options || {};
  options.gzip = true;
  return deflate$1(input, options);
}


var Deflate_1 = Deflate;
var deflate_2$1 = deflate$1;
var deflateRaw_1 = deflateRaw;
var gzip_1 = gzip;
var constants$1 = constants;

var deflate_1$1 = {
	Deflate: Deflate_1,
	deflate: deflate_2$1,
	deflateRaw: deflateRaw_1,
	gzip: gzip_1,
	constants: constants$1
};

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

// See state defs from inflate.js
const BAD = 30;       /* got a data error -- remain here until reset */
const TYPE = 12;      /* i: waiting for type bits, including last-flag bit */

/*
   Decode literal, length, and distance codes and write out the resulting
   literal and match bytes until either not enough input or output is
   available, an end-of-block is encountered, or a data error is encountered.
   When large enough input and output buffers are supplied to inflate(), for
   example, a 16K input buffer and a 64K output buffer, more than 95% of the
   inflate execution time is spent in this routine.

   Entry assumptions:

        state.mode === LEN
        strm.avail_in >= 6
        strm.avail_out >= 258
        start >= strm.avail_out
        state.bits < 8

   On return, state.mode is one of:

        LEN -- ran out of enough output space or enough available input
        TYPE -- reached end of block code, inflate() to interpret next block
        BAD -- error in block data

   Notes:

    - The maximum input bits used by a length/distance pair is 15 bits for the
      length code, 5 bits for the length extra, 15 bits for the distance code,
      and 13 bits for the distance extra.  This totals 48 bits, or six bytes.
      Therefore if strm.avail_in >= 6, then there is enough input to avoid
      checking for available input while decoding.

    - The maximum bytes that a single length/distance pair can output is 258
      bytes, which is the maximum length that can be coded.  inflate_fast()
      requires strm.avail_out >= 258 for each loop to avoid checking for
      output space.
 */
var inffast = function inflate_fast(strm, start) {
  let _in;                    /* local strm.input */
  let last;                   /* have enough input while in < last */
  let _out;                   /* local strm.output */
  let beg;                    /* inflate()'s initial strm.output */
  let end;                    /* while out < end, enough space available */
//#ifdef INFLATE_STRICT
  let dmax;                   /* maximum distance from zlib header */
//#endif
  let wsize;                  /* window size or zero if not using window */
  let whave;                  /* valid bytes in the window */
  let wnext;                  /* window write index */
  // Use `s_window` instead `window`, avoid conflict with instrumentation tools
  let s_window;               /* allocated sliding window, if wsize != 0 */
  let hold;                   /* local strm.hold */
  let bits;                   /* local strm.bits */
  let lcode;                  /* local strm.lencode */
  let dcode;                  /* local strm.distcode */
  let lmask;                  /* mask for first level of length codes */
  let dmask;                  /* mask for first level of distance codes */
  let here;                   /* retrieved table entry */
  let op;                     /* code bits, operation, extra bits, or */
                              /*  window position, window bytes to copy */
  let len;                    /* match length, unused bytes */
  let dist;                   /* match distance */
  let from;                   /* where to copy match from */
  let from_source;


  let input, output; // JS specific, because we have no pointers

  /* copy state to local variables */
  const state = strm.state;
  //here = state.here;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end = _out + (strm.avail_out - 257);
//#ifdef INFLATE_STRICT
  dmax = state.dmax;
//#endif
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;


  /* decode literals and length/distances until end-of-block or not enough
     input data or output space */

  top:
  do {
    if (bits < 15) {
      hold += input[_in++] << bits;
      bits += 8;
      hold += input[_in++] << bits;
      bits += 8;
    }

    here = lcode[hold & lmask];

    dolen:
    for (;;) { // Goto emulation
      op = here >>> 24/*here.bits*/;
      hold >>>= op;
      bits -= op;
      op = (here >>> 16) & 0xff/*here.op*/;
      if (op === 0) {                          /* literal */
        //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
        //        "inflate:         literal '%c'\n" :
        //        "inflate:         literal 0x%02x\n", here.val));
        output[_out++] = here & 0xffff/*here.val*/;
      }
      else if (op & 16) {                     /* length base */
        len = here & 0xffff/*here.val*/;
        op &= 15;                           /* number of extra bits */
        if (op) {
          if (bits < op) {
            hold += input[_in++] << bits;
            bits += 8;
          }
          len += hold & ((1 << op) - 1);
          hold >>>= op;
          bits -= op;
        }
        //Tracevv((stderr, "inflate:         length %u\n", len));
        if (bits < 15) {
          hold += input[_in++] << bits;
          bits += 8;
          hold += input[_in++] << bits;
          bits += 8;
        }
        here = dcode[hold & dmask];

        dodist:
        for (;;) { // goto emulation
          op = here >>> 24/*here.bits*/;
          hold >>>= op;
          bits -= op;
          op = (here >>> 16) & 0xff/*here.op*/;

          if (op & 16) {                      /* distance base */
            dist = here & 0xffff/*here.val*/;
            op &= 15;                       /* number of extra bits */
            if (bits < op) {
              hold += input[_in++] << bits;
              bits += 8;
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
            }
            dist += hold & ((1 << op) - 1);
//#ifdef INFLATE_STRICT
            if (dist > dmax) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD;
              break top;
            }
//#endif
            hold >>>= op;
            bits -= op;
            //Tracevv((stderr, "inflate:         distance %u\n", dist));
            op = _out - beg;                /* max distance in output */
            if (dist > op) {                /* see if copy from window */
              op = dist - op;               /* distance back in window */
              if (op > whave) {
                if (state.sane) {
                  strm.msg = 'invalid distance too far back';
                  state.mode = BAD;
                  break top;
                }

// (!) This block is disabled in zlib defaults,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//                if (len <= op - whave) {
//                  do {
//                    output[_out++] = 0;
//                  } while (--len);
//                  continue top;
//                }
//                len -= op - whave;
//                do {
//                  output[_out++] = 0;
//                } while (--op > whave);
//                if (op === 0) {
//                  from = _out - dist;
//                  do {
//                    output[_out++] = output[from++];
//                  } while (--len);
//                  continue top;
//                }
//#endif
              }
              from = 0; // window index
              from_source = s_window;
              if (wnext === 0) {           /* very common case */
                from += wsize - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              else if (wnext < op) {      /* wrap around window */
                from += wsize + wnext - op;
                op -= wnext;
                if (op < len) {         /* some from end of window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = 0;
                  if (wnext < len) {  /* some from start of window */
                    op = wnext;
                    len -= op;
                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);
                    from = _out - dist;      /* rest from output */
                    from_source = output;
                  }
                }
              }
              else {                      /* contiguous in window */
                from += wnext - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              while (len > 2) {
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                len -= 3;
              }
              if (len) {
                output[_out++] = from_source[from++];
                if (len > 1) {
                  output[_out++] = from_source[from++];
                }
              }
            }
            else {
              from = _out - dist;          /* copy direct from output */
              do {                        /* minimum length is three */
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                len -= 3;
              } while (len > 2);
              if (len) {
                output[_out++] = output[from++];
                if (len > 1) {
                  output[_out++] = output[from++];
                }
              }
            }
          }
          else if ((op & 64) === 0) {          /* 2nd level distance code */
            here = dcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
            continue dodist;
          }
          else {
            strm.msg = 'invalid distance code';
            state.mode = BAD;
            break top;
          }

          break; // need to emulate goto via "continue"
        }
      }
      else if ((op & 64) === 0) {              /* 2nd level length code */
        here = lcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
        continue dolen;
      }
      else if (op & 32) {                     /* end-of-block */
        //Tracevv((stderr, "inflate:         end of block\n"));
        state.mode = TYPE;
        break top;
      }
      else {
        strm.msg = 'invalid literal/length code';
        state.mode = BAD;
        break top;
      }

      break; // need to emulate goto via "continue"
    }
  } while (_in < last && _out < end);

  /* return unused bytes (on entry, bits < 8, so in won't go too far back) */
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;

  /* update state and return */
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = (_in < last ? 5 + (last - _in) : 5 - (_in - last));
  strm.avail_out = (_out < end ? 257 + (end - _out) : 257 - (_out - end));
  state.hold = hold;
  state.bits = bits;
  return;
};

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

const MAXBITS = 15;
const ENOUGH_LENS = 852;
const ENOUGH_DISTS = 592;
//const ENOUGH = (ENOUGH_LENS+ENOUGH_DISTS);

const CODES = 0;
const LENS = 1;
const DISTS = 2;

const lbase = new Uint16Array([ /* Length codes 257..285 base */
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0
]);

const lext = new Uint8Array([ /* Length codes 257..285 extra */
  16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18,
  19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78
]);

const dbase = new Uint16Array([ /* Distance codes 0..29 base */
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577, 0, 0
]);

const dext = new Uint8Array([ /* Distance codes 0..29 extra */
  16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22,
  23, 23, 24, 24, 25, 25, 26, 26, 27, 27,
  28, 28, 29, 29, 64, 64
]);

const inflate_table = (type, lens, lens_index, codes, table, table_index, work, opts) =>
{
  const bits = opts.bits;
      //here = opts.here; /* table entry for duplication */

  let len = 0;               /* a code's length in bits */
  let sym = 0;               /* index of code symbols */
  let min = 0, max = 0;          /* minimum and maximum code lengths */
  let root = 0;              /* number of index bits for root table */
  let curr = 0;              /* number of index bits for current table */
  let drop = 0;              /* code bits to drop for sub-table */
  let left = 0;                   /* number of prefix codes available */
  let used = 0;              /* code entries in table used */
  let huff = 0;              /* Huffman code */
  let incr;              /* for incrementing code, index */
  let fill;              /* index for replicating entries */
  let low;               /* low bits for current root entry */
  let mask;              /* mask for low root bits */
  let next;             /* next available space in table */
  let base = null;     /* base value table to use */
  let base_index = 0;
//  let shoextra;    /* extra bits table to use */
  let end;                    /* use base and extra for symbol > end */
  const count = new Uint16Array(MAXBITS + 1); //[MAXBITS+1];    /* number of codes of each length */
  const offs = new Uint16Array(MAXBITS + 1); //[MAXBITS+1];     /* offsets in table for each length */
  let extra = null;
  let extra_index = 0;

  let here_bits, here_op, here_val;

  /*
   Process a set of code lengths to create a canonical Huffman code.  The
   code lengths are lens[0..codes-1].  Each length corresponds to the
   symbols 0..codes-1.  The Huffman code is generated by first sorting the
   symbols by length from short to long, and retaining the symbol order
   for codes with equal lengths.  Then the code starts with all zero bits
   for the first code of the shortest length, and the codes are integer
   increments for the same length, and zeros are appended as the length
   increases.  For the deflate format, these bits are stored backwards
   from their more natural integer increment ordering, and so when the
   decoding tables are built in the large loop below, the integer codes
   are incremented backwards.

   This routine assumes, but does not check, that all of the entries in
   lens[] are in the range 0..MAXBITS.  The caller must assure this.
   1..MAXBITS is interpreted as that code length.  zero means that that
   symbol does not occur in this code.

   The codes are sorted by computing a count of codes for each length,
   creating from that a table of starting indices for each length in the
   sorted table, and then entering the symbols in order in the sorted
   table.  The sorted table is work[], with that space being provided by
   the caller.

   The length counts are used for other purposes as well, i.e. finding
   the minimum and maximum length codes, determining if there are any
   codes at all, checking for a valid set of lengths, and looking ahead
   at length counts to determine sub-table sizes when building the
   decoding tables.
   */

  /* accumulate lengths for codes (assumes lens[] all in 0..MAXBITS) */
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }

  /* bound code lengths, force root to be within code lengths */
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) { break; }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) {                     /* no symbols to code at all */
    //table.op[opts.table_index] = 64;  //here.op = (var char)64;    /* invalid code marker */
    //table.bits[opts.table_index] = 1;   //here.bits = (var char)1;
    //table.val[opts.table_index++] = 0;   //here.val = (var short)0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;


    //table.op[opts.table_index] = 64;
    //table.bits[opts.table_index] = 1;
    //table.val[opts.table_index++] = 0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;

    opts.bits = 1;
    return 0;     /* no symbols, but wait for decoding to report error */
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) { break; }
  }
  if (root < min) {
    root = min;
  }

  /* check for an over-subscribed or incomplete set of lengths */
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }        /* over-subscribed */
  }
  if (left > 0 && (type === CODES || max !== 1)) {
    return -1;                      /* incomplete set */
  }

  /* generate offsets into symbol table for each length for sorting */
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }

  /* sort symbols by length, by symbol order within each length */
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }

  /*
   Create and fill in decoding tables.  In this loop, the table being
   filled is at next and has curr index bits.  The code being used is huff
   with length len.  That code is converted to an index by dropping drop
   bits off of the bottom.  For codes where len is less than drop + curr,
   those top drop + curr - len bits are incremented through all values to
   fill the table with replicated entries.

   root is the number of index bits for the root table.  When len exceeds
   root, sub-tables are created pointed to by the root entry with an index
   of the low root bits of huff.  This is saved in low to check for when a
   new sub-table should be started.  drop is zero when the root table is
   being filled, and drop is root when sub-tables are being filled.

   When a new sub-table is needed, it is necessary to look ahead in the
   code lengths to determine what size sub-table is needed.  The length
   counts are used for this, and so count[] is decremented as codes are
   entered in the tables.

   used keeps track of how many table entries have been allocated from the
   provided *table space.  It is checked for LENS and DIST tables against
   the constants ENOUGH_LENS and ENOUGH_DISTS to guard against changes in
   the initial root table size constants.  See the comments in inftrees.h
   for more information.

   sym increments through all symbols, and the loop terminates when
   all codes of length max, i.e. all codes, have been processed.  This
   routine permits incomplete codes, so another loop after this one fills
   in the rest of the decoding tables with invalid code markers.
   */

  /* set up for code type */
  // poor man optimization - use if-else instead of switch,
  // to avoid deopts in old v8
  if (type === CODES) {
    base = extra = work;    /* dummy value--not used */
    end = 19;

  } else if (type === LENS) {
    base = lbase;
    base_index -= 257;
    extra = lext;
    extra_index -= 257;
    end = 256;

  } else {                    /* DISTS */
    base = dbase;
    extra = dext;
    end = -1;
  }

  /* initialize opts for loop */
  huff = 0;                   /* starting code */
  sym = 0;                    /* starting code symbol */
  len = min;                  /* starting code length */
  next = table_index;              /* current table to fill in */
  curr = root;                /* current table index bits */
  drop = 0;                   /* current bits to drop from code for index */
  low = -1;                   /* trigger new sub-table when len > root */
  used = 1 << root;          /* use root table entries */
  mask = used - 1;            /* mask for comparing low */

  /* check available table space */
  if ((type === LENS && used > ENOUGH_LENS) ||
    (type === DISTS && used > ENOUGH_DISTS)) {
    return 1;
  }

  /* process all codes and make table entries */
  for (;;) {
    /* create table entry */
    here_bits = len - drop;
    if (work[sym] < end) {
      here_op = 0;
      here_val = work[sym];
    }
    else if (work[sym] > end) {
      here_op = extra[extra_index + work[sym]];
      here_val = base[base_index + work[sym]];
    }
    else {
      here_op = 32 + 64;         /* end of block */
      here_val = 0;
    }

    /* replicate for those indices with low len bits equal to huff */
    incr = 1 << (len - drop);
    fill = 1 << curr;
    min = fill;                 /* save offset to next table */
    do {
      fill -= incr;
      table[next + (huff >> drop) + fill] = (here_bits << 24) | (here_op << 16) | here_val |0;
    } while (fill !== 0);

    /* backwards increment the len-bit code huff */
    incr = 1 << (len - 1);
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }

    /* go to next symbol, update count, len */
    sym++;
    if (--count[len] === 0) {
      if (len === max) { break; }
      len = lens[lens_index + work[sym]];
    }

    /* create new sub-table if needed */
    if (len > root && (huff & mask) !== low) {
      /* if first time, transition to sub-tables */
      if (drop === 0) {
        drop = root;
      }

      /* increment past last table */
      next += min;            /* here min is 1 << curr */

      /* determine length of next table */
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) { break; }
        curr++;
        left <<= 1;
      }

      /* check for enough space */
      used += 1 << curr;
      if ((type === LENS && used > ENOUGH_LENS) ||
        (type === DISTS && used > ENOUGH_DISTS)) {
        return 1;
      }

      /* point entry in root table to sub-table */
      low = huff & mask;
      /*table.op[low] = curr;
      table.bits[low] = root;
      table.val[low] = next - opts.table_index;*/
      table[low] = (root << 24) | (curr << 16) | (next - table_index) |0;
    }
  }

  /* fill in remaining table entry if code is incomplete (guaranteed to have
   at most one remaining entry, since if the code is incomplete, the
   maximum code length that was allowed to get this far is one bit) */
  if (huff !== 0) {
    //table.op[next + huff] = 64;            /* invalid code marker */
    //table.bits[next + huff] = len - drop;
    //table.val[next + huff] = 0;
    table[next + huff] = ((len - drop) << 24) | (64 << 16) |0;
  }

  /* set return parameters */
  //opts.table_index += used;
  opts.bits = root;
  return 0;
};


var inftrees = inflate_table;

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.






const CODES$1 = 0;
const LENS$1 = 1;
const DISTS$1 = 2;

/* Public constants ==========================================================*/
/* ===========================================================================*/

const {
  Z_FINISH: Z_FINISH$2, Z_BLOCK: Z_BLOCK$1, Z_TREES,
  Z_OK: Z_OK$2, Z_STREAM_END: Z_STREAM_END$2, Z_NEED_DICT, Z_STREAM_ERROR: Z_STREAM_ERROR$1, Z_DATA_ERROR: Z_DATA_ERROR$1, Z_MEM_ERROR, Z_BUF_ERROR: Z_BUF_ERROR$1,
  Z_DEFLATED: Z_DEFLATED$2
} = constants;


/* STATES ====================================================================*/
/* ===========================================================================*/


const    HEAD = 1;       /* i: waiting for magic header */
const    FLAGS = 2;      /* i: waiting for method and flags (gzip) */
const    TIME = 3;       /* i: waiting for modification time (gzip) */
const    OS = 4;         /* i: waiting for extra flags and operating system (gzip) */
const    EXLEN = 5;      /* i: waiting for extra length (gzip) */
const    EXTRA = 6;      /* i: waiting for extra bytes (gzip) */
const    NAME = 7;       /* i: waiting for end of file name (gzip) */
const    COMMENT = 8;    /* i: waiting for end of comment (gzip) */
const    HCRC = 9;       /* i: waiting for header crc (gzip) */
const    DICTID = 10;    /* i: waiting for dictionary check value */
const    DICT = 11;      /* waiting for inflateSetDictionary() call */
const        TYPE$1 = 12;      /* i: waiting for type bits, including last-flag bit */
const        TYPEDO = 13;    /* i: same, but skip check to exit inflate on new block */
const        STORED = 14;    /* i: waiting for stored size (length and complement) */
const        COPY_ = 15;     /* i/o: same as COPY below, but only first time in */
const        COPY = 16;      /* i/o: waiting for input or output to copy stored block */
const        TABLE = 17;     /* i: waiting for dynamic block table lengths */
const        LENLENS = 18;   /* i: waiting for code length code lengths */
const        CODELENS = 19;  /* i: waiting for length/lit and distance code lengths */
const            LEN_ = 20;      /* i: same as LEN below, but only first time in */
const            LEN = 21;       /* i: waiting for length/lit/eob code */
const            LENEXT = 22;    /* i: waiting for length extra bits */
const            DIST = 23;      /* i: waiting for distance code */
const            DISTEXT = 24;   /* i: waiting for distance extra bits */
const            MATCH = 25;     /* o: waiting for output space to copy string */
const            LIT = 26;       /* o: waiting for output space to write literal */
const    CHECK = 27;     /* i: waiting for 32-bit check value */
const    LENGTH = 28;    /* i: waiting for 32-bit length (gzip) */
const    DONE$1 = 29;      /* finished check, done -- remain here until reset */
const    BAD$1 = 30;       /* got a data error -- remain here until reset */
const    MEM = 31;       /* got an inflate() memory error -- remain here until reset */
const    SYNC = 32;      /* looking for synchronization bytes to restart inflate() */

/* ===========================================================================*/



const ENOUGH_LENS$1 = 852;
const ENOUGH_DISTS$1 = 592;
//const ENOUGH =  (ENOUGH_LENS+ENOUGH_DISTS);

const MAX_WBITS$1 = 15;
/* 32K LZ77 window */
const DEF_WBITS = MAX_WBITS$1;


const zswap32 = (q) => {

  return  (((q >>> 24) & 0xff) +
          ((q >>> 8) & 0xff00) +
          ((q & 0xff00) << 8) +
          ((q & 0xff) << 24));
};


function InflateState() {
  this.mode = 0;             /* current inflate mode */
  this.last = false;          /* true if processing last block */
  this.wrap = 0;              /* bit 0 true for zlib, bit 1 true for gzip */
  this.havedict = false;      /* true if dictionary provided */
  this.flags = 0;             /* gzip header method and flags (0 if zlib) */
  this.dmax = 0;              /* zlib header max distance (INFLATE_STRICT) */
  this.check = 0;             /* protected copy of check value */
  this.total = 0;             /* protected copy of output count */
  // TODO: may be {}
  this.head = null;           /* where to save gzip header information */

  /* sliding window */
  this.wbits = 0;             /* log base 2 of requested window size */
  this.wsize = 0;             /* window size or zero if not using window */
  this.whave = 0;             /* valid bytes in the window */
  this.wnext = 0;             /* window write index */
  this.window = null;         /* allocated sliding window, if needed */

  /* bit accumulator */
  this.hold = 0;              /* input bit accumulator */
  this.bits = 0;              /* number of bits in "in" */

  /* for string and stored block copying */
  this.length = 0;            /* literal or length of data to copy */
  this.offset = 0;            /* distance back to copy string from */

  /* for table and code decoding */
  this.extra = 0;             /* extra bits needed */

  /* fixed and dynamic code tables */
  this.lencode = null;          /* starting table for length/literal codes */
  this.distcode = null;         /* starting table for distance codes */
  this.lenbits = 0;           /* index bits for lencode */
  this.distbits = 0;          /* index bits for distcode */

  /* dynamic table building */
  this.ncode = 0;             /* number of code length code lengths */
  this.nlen = 0;              /* number of length code lengths */
  this.ndist = 0;             /* number of distance code lengths */
  this.have = 0;              /* number of code lengths in lens[] */
  this.next = null;              /* next available space in codes[] */

  this.lens = new Uint16Array(320); /* temporary storage for code lengths */
  this.work = new Uint16Array(288); /* work area for code table building */

  /*
   because we don't have pointers in js, we use lencode and distcode directly
   as buffers so we don't need codes
  */
  //this.codes = new Int32Array(ENOUGH);       /* space for code tables */
  this.lendyn = null;              /* dynamic table for length/literal codes (JS specific) */
  this.distdyn = null;             /* dynamic table for distance codes (JS specific) */
  this.sane = 0;                   /* if false, allow invalid distance too far */
  this.back = 0;                   /* bits back of last unprocessed length/lit */
  this.was = 0;                    /* initial length of match */
}


const inflateResetKeep = (strm) => {

  if (!strm || !strm.state) { return Z_STREAM_ERROR$1; }
  const state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = ''; /*Z_NULL*/
  if (state.wrap) {       /* to support ill-conceived Java test suite */
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.dmax = 32768;
  state.head = null/*Z_NULL*/;
  state.hold = 0;
  state.bits = 0;
  //state.lencode = state.distcode = state.next = state.codes;
  state.lencode = state.lendyn = new Int32Array(ENOUGH_LENS$1);
  state.distcode = state.distdyn = new Int32Array(ENOUGH_DISTS$1);

  state.sane = 1;
  state.back = -1;
  //Tracev((stderr, "inflate: reset\n"));
  return Z_OK$2;
};


const inflateReset = (strm) => {

  if (!strm || !strm.state) { return Z_STREAM_ERROR$1; }
  const state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);

};


const inflateReset2 = (strm, windowBits) => {
  let wrap;

  /* get the state */
  if (!strm || !strm.state) { return Z_STREAM_ERROR$1; }
  const state = strm.state;

  /* extract wrap request from windowBits parameter */
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  }
  else {
    wrap = (windowBits >> 4) + 1;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }

  /* set number of window bits, free window if different */
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR$1;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }

  /* update state and reset the rest of it */
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
};


const inflateInit2 = (strm, windowBits) => {

  if (!strm) { return Z_STREAM_ERROR$1; }
  //strm.msg = Z_NULL;                 /* in case we return an error */

  const state = new InflateState();

  //if (state === Z_NULL) return Z_MEM_ERROR;
  //Tracev((stderr, "inflate: allocated\n"));
  strm.state = state;
  state.window = null/*Z_NULL*/;
  const ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK$2) {
    strm.state = null/*Z_NULL*/;
  }
  return ret;
};


const inflateInit = (strm) => {

  return inflateInit2(strm, DEF_WBITS);
};


/*
 Return state with length and distance decoding tables and index sizes set to
 fixed code decoding.  Normally this returns fixed tables from inffixed.h.
 If BUILDFIXED is defined, then instead this routine builds the tables the
 first time it's called, and returns those tables the first time and
 thereafter.  This reduces the size of the code by about 2K bytes, in
 exchange for a little execution time.  However, BUILDFIXED should not be
 used for threaded applications, since the rewriting of the tables and virgin
 may not be thread-safe.
 */
let virgin = true;

let lenfix, distfix; // We have no pointers in JS, so keep tables separate


const fixedtables = (state) => {

  /* build fixed huffman tables if first call (may not be thread safe) */
  if (virgin) {
    lenfix = new Int32Array(512);
    distfix = new Int32Array(32);

    /* literal/length table */
    let sym = 0;
    while (sym < 144) { state.lens[sym++] = 8; }
    while (sym < 256) { state.lens[sym++] = 9; }
    while (sym < 280) { state.lens[sym++] = 7; }
    while (sym < 288) { state.lens[sym++] = 8; }

    inftrees(LENS$1,  state.lens, 0, 288, lenfix,   0, state.work, { bits: 9 });

    /* distance table */
    sym = 0;
    while (sym < 32) { state.lens[sym++] = 5; }

    inftrees(DISTS$1, state.lens, 0, 32,   distfix, 0, state.work, { bits: 5 });

    /* do this just once */
    virgin = false;
  }

  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
};


/*
 Update the window with the last wsize (normally 32K) bytes written before
 returning.  If window does not exist yet, create it.  This is only called
 when a window is already in use, or when output has been written during this
 inflate call, but the end of the deflate stream has not been reached yet.
 It is also called to create a window for dictionary data when a dictionary
 is loaded.

 Providing output buffers larger than 32K to inflate() should provide a speed
 advantage, since only the last 32K of output is copied to the sliding window
 upon return from inflate(), and since all distances after the first 32K of
 output will fall in the output data, making match copies simpler and faster.
 The advantage may be dependent on the size of the processor's data caches.
 */
const updatewindow = (strm, src, end, copy) => {

  let dist;
  const state = strm.state;

  /* if it hasn't been done already, allocate space for the window */
  if (state.window === null) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;

    state.window = new Uint8Array(state.wsize);
  }

  /* copy state->wsize or less output bytes into the circular window */
  if (copy >= state.wsize) {
    state.window.set(src.subarray(end - state.wsize, end), 0);
    state.wnext = 0;
    state.whave = state.wsize;
  }
  else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    //zmemcpy(state->window + state->wnext, end - copy, dist);
    state.window.set(src.subarray(end - copy, end - copy + dist), state.wnext);
    copy -= dist;
    if (copy) {
      //zmemcpy(state->window, end - copy, copy);
      state.window.set(src.subarray(end - copy, end), 0);
      state.wnext = copy;
      state.whave = state.wsize;
    }
    else {
      state.wnext += dist;
      if (state.wnext === state.wsize) { state.wnext = 0; }
      if (state.whave < state.wsize) { state.whave += dist; }
    }
  }
  return 0;
};


const inflate = (strm, flush) => {

  let state;
  let input, output;          // input/output buffers
  let next;                   /* next input INDEX */
  let put;                    /* next output INDEX */
  let have, left;             /* available input and output */
  let hold;                   /* bit buffer */
  let bits;                   /* bits in bit buffer */
  let _in, _out;              /* save starting available input and output */
  let copy;                   /* number of stored or match bytes to copy */
  let from;                   /* where to copy match bytes from */
  let from_source;
  let here = 0;               /* current decoding table entry */
  let here_bits, here_op, here_val; // paked "here" denormalized (JS specific)
  //let last;                   /* parent table entry */
  let last_bits, last_op, last_val; // paked "last" denormalized (JS specific)
  let len;                    /* length to copy for repeats, bits to drop */
  let ret;                    /* return code */
  const hbuf = new Uint8Array(4);    /* buffer for gzip header crc calculation */
  let opts;

  let n; // temporary variable for NEED_BITS

  const order = /* permutation of code lengths */
    new Uint8Array([ 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ]);


  if (!strm || !strm.state || !strm.output ||
      (!strm.input && strm.avail_in !== 0)) {
    return Z_STREAM_ERROR$1;
  }

  state = strm.state;
  if (state.mode === TYPE$1) { state.mode = TYPEDO; }    /* skip check */


  //--- LOAD() ---
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  //---

  _in = have;
  _out = left;
  ret = Z_OK$2;

  inf_leave: // goto emulation
  for (;;) {
    switch (state.mode) {
      case HEAD:
        if (state.wrap === 0) {
          state.mode = TYPEDO;
          break;
        }
        //=== NEEDBITS(16);
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if ((state.wrap & 2) && hold === 0x8b1f) {  /* gzip header */
          state.check = 0/*crc32(0L, Z_NULL, 0)*/;
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32_1(state.check, hbuf, 2, 0);
          //===//

          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          state.mode = FLAGS;
          break;
        }
        state.flags = 0;           /* expect zlib header */
        if (state.head) {
          state.head.done = false;
        }
        if (!(state.wrap & 1) ||   /* check if zlib header allowed */
          (((hold & 0xff)/*BITS(8)*/ << 8) + (hold >> 8)) % 31) {
          strm.msg = 'incorrect header check';
          state.mode = BAD$1;
          break;
        }
        if ((hold & 0x0f)/*BITS(4)*/ !== Z_DEFLATED$2) {
          strm.msg = 'unknown compression method';
          state.mode = BAD$1;
          break;
        }
        //--- DROPBITS(4) ---//
        hold >>>= 4;
        bits -= 4;
        //---//
        len = (hold & 0x0f)/*BITS(4)*/ + 8;
        if (state.wbits === 0) {
          state.wbits = len;
        }
        else if (len > state.wbits) {
          strm.msg = 'invalid window size';
          state.mode = BAD$1;
          break;
        }

        // !!! pako patch. Force use `options.windowBits` if passed.
        // Required to always use max window size by default.
        state.dmax = 1 << state.wbits;
        //state.dmax = 1 << len;

        //Tracev((stderr, "inflate:   zlib header ok\n"));
        strm.adler = state.check = 1/*adler32(0L, Z_NULL, 0)*/;
        state.mode = hold & 0x200 ? DICTID : TYPE$1;
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        break;
      case FLAGS:
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.flags = hold;
        if ((state.flags & 0xff) !== Z_DEFLATED$2) {
          strm.msg = 'unknown compression method';
          state.mode = BAD$1;
          break;
        }
        if (state.flags & 0xe000) {
          strm.msg = 'unknown header flags set';
          state.mode = BAD$1;
          break;
        }
        if (state.head) {
          state.head.text = ((hold >> 8) & 1);
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32_1(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = TIME;
        /* falls through */
      case TIME:
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (state.head) {
          state.head.time = hold;
        }
        if (state.flags & 0x0200) {
          //=== CRC4(state.check, hold)
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          hbuf[2] = (hold >>> 16) & 0xff;
          hbuf[3] = (hold >>> 24) & 0xff;
          state.check = crc32_1(state.check, hbuf, 4, 0);
          //===
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = OS;
        /* falls through */
      case OS:
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (state.head) {
          state.head.xflags = (hold & 0xff);
          state.head.os = (hold >> 8);
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32_1(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = EXLEN;
        /* falls through */
      case EXLEN:
        if (state.flags & 0x0400) {
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.length = hold;
          if (state.head) {
            state.head.extra_len = hold;
          }
          if (state.flags & 0x0200) {
            //=== CRC2(state.check, hold);
            hbuf[0] = hold & 0xff;
            hbuf[1] = (hold >>> 8) & 0xff;
            state.check = crc32_1(state.check, hbuf, 2, 0);
            //===//
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
        }
        else if (state.head) {
          state.head.extra = null/*Z_NULL*/;
        }
        state.mode = EXTRA;
        /* falls through */
      case EXTRA:
        if (state.flags & 0x0400) {
          copy = state.length;
          if (copy > have) { copy = have; }
          if (copy) {
            if (state.head) {
              len = state.head.extra_len - state.length;
              if (!state.head.extra) {
                // Use untyped array for more convenient processing later
                state.head.extra = new Uint8Array(state.head.extra_len);
              }
              state.head.extra.set(
                input.subarray(
                  next,
                  // extra field is limited to 65536 bytes
                  // - no need for additional size check
                  next + copy
                ),
                /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                len
              );
              //zmemcpy(state.head.extra + len, next,
              //        len + copy > state.head.extra_max ?
              //        state.head.extra_max - len : copy);
            }
            if (state.flags & 0x0200) {
              state.check = crc32_1(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            state.length -= copy;
          }
          if (state.length) { break inf_leave; }
        }
        state.length = 0;
        state.mode = NAME;
        /* falls through */
      case NAME:
        if (state.flags & 0x0800) {
          if (have === 0) { break inf_leave; }
          copy = 0;
          do {
            // TODO: 2 or 1 bytes?
            len = input[next + copy++];
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len &&
                (state.length < 65536 /*state.head.name_max*/)) {
              state.head.name += String.fromCharCode(len);
            }
          } while (len && copy < have);

          if (state.flags & 0x0200) {
            state.check = crc32_1(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          if (len) { break inf_leave; }
        }
        else if (state.head) {
          state.head.name = null;
        }
        state.length = 0;
        state.mode = COMMENT;
        /* falls through */
      case COMMENT:
        if (state.flags & 0x1000) {
          if (have === 0) { break inf_leave; }
          copy = 0;
          do {
            len = input[next + copy++];
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len &&
                (state.length < 65536 /*state.head.comm_max*/)) {
              state.head.comment += String.fromCharCode(len);
            }
          } while (len && copy < have);
          if (state.flags & 0x0200) {
            state.check = crc32_1(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          if (len) { break inf_leave; }
        }
        else if (state.head) {
          state.head.comment = null;
        }
        state.mode = HCRC;
        /* falls through */
      case HCRC:
        if (state.flags & 0x0200) {
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          if (hold !== (state.check & 0xffff)) {
            strm.msg = 'header crc mismatch';
            state.mode = BAD$1;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
        }
        if (state.head) {
          state.head.hcrc = ((state.flags >> 9) & 1);
          state.head.done = true;
        }
        strm.adler = state.check = 0;
        state.mode = TYPE$1;
        break;
      case DICTID:
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        strm.adler = state.check = zswap32(hold);
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = DICT;
        /* falls through */
      case DICT:
        if (state.havedict === 0) {
          //--- RESTORE() ---
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          //---
          return Z_NEED_DICT;
        }
        strm.adler = state.check = 1/*adler32(0L, Z_NULL, 0)*/;
        state.mode = TYPE$1;
        /* falls through */
      case TYPE$1:
        if (flush === Z_BLOCK$1 || flush === Z_TREES) { break inf_leave; }
        /* falls through */
      case TYPEDO:
        if (state.last) {
          //--- BYTEBITS() ---//
          hold >>>= bits & 7;
          bits -= bits & 7;
          //---//
          state.mode = CHECK;
          break;
        }
        //=== NEEDBITS(3); */
        while (bits < 3) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.last = (hold & 0x01)/*BITS(1)*/;
        //--- DROPBITS(1) ---//
        hold >>>= 1;
        bits -= 1;
        //---//

        switch ((hold & 0x03)/*BITS(2)*/) {
          case 0:                             /* stored block */
            //Tracev((stderr, "inflate:     stored block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = STORED;
            break;
          case 1:                             /* fixed block */
            fixedtables(state);
            //Tracev((stderr, "inflate:     fixed codes block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = LEN_;             /* decode codes */
            if (flush === Z_TREES) {
              //--- DROPBITS(2) ---//
              hold >>>= 2;
              bits -= 2;
              //---//
              break inf_leave;
            }
            break;
          case 2:                             /* dynamic block */
            //Tracev((stderr, "inflate:     dynamic codes block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = TABLE;
            break;
          case 3:
            strm.msg = 'invalid block type';
            state.mode = BAD$1;
        }
        //--- DROPBITS(2) ---//
        hold >>>= 2;
        bits -= 2;
        //---//
        break;
      case STORED:
        //--- BYTEBITS() ---// /* go to byte boundary */
        hold >>>= bits & 7;
        bits -= bits & 7;
        //---//
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if ((hold & 0xffff) !== ((hold >>> 16) ^ 0xffff)) {
          strm.msg = 'invalid stored block lengths';
          state.mode = BAD$1;
          break;
        }
        state.length = hold & 0xffff;
        //Tracev((stderr, "inflate:       stored length %u\n",
        //        state.length));
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = COPY_;
        if (flush === Z_TREES) { break inf_leave; }
        /* falls through */
      case COPY_:
        state.mode = COPY;
        /* falls through */
      case COPY:
        copy = state.length;
        if (copy) {
          if (copy > have) { copy = have; }
          if (copy > left) { copy = left; }
          if (copy === 0) { break inf_leave; }
          //--- zmemcpy(put, next, copy); ---
          output.set(input.subarray(next, next + copy), put);
          //---//
          have -= copy;
          next += copy;
          left -= copy;
          put += copy;
          state.length -= copy;
          break;
        }
        //Tracev((stderr, "inflate:       stored end\n"));
        state.mode = TYPE$1;
        break;
      case TABLE:
        //=== NEEDBITS(14); */
        while (bits < 14) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.nlen = (hold & 0x1f)/*BITS(5)*/ + 257;
        //--- DROPBITS(5) ---//
        hold >>>= 5;
        bits -= 5;
        //---//
        state.ndist = (hold & 0x1f)/*BITS(5)*/ + 1;
        //--- DROPBITS(5) ---//
        hold >>>= 5;
        bits -= 5;
        //---//
        state.ncode = (hold & 0x0f)/*BITS(4)*/ + 4;
        //--- DROPBITS(4) ---//
        hold >>>= 4;
        bits -= 4;
        //---//
//#ifndef PKZIP_BUG_WORKAROUND
        if (state.nlen > 286 || state.ndist > 30) {
          strm.msg = 'too many length or distance symbols';
          state.mode = BAD$1;
          break;
        }
//#endif
        //Tracev((stderr, "inflate:       table sizes ok\n"));
        state.have = 0;
        state.mode = LENLENS;
        /* falls through */
      case LENLENS:
        while (state.have < state.ncode) {
          //=== NEEDBITS(3);
          while (bits < 3) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.lens[order[state.have++]] = (hold & 0x07);//BITS(3);
          //--- DROPBITS(3) ---//
          hold >>>= 3;
          bits -= 3;
          //---//
        }
        while (state.have < 19) {
          state.lens[order[state.have++]] = 0;
        }
        // We have separate tables & no pointers. 2 commented lines below not needed.
        //state.next = state.codes;
        //state.lencode = state.next;
        // Switch to use dynamic table
        state.lencode = state.lendyn;
        state.lenbits = 7;

        opts = { bits: state.lenbits };
        ret = inftrees(CODES$1, state.lens, 0, 19, state.lencode, 0, state.work, opts);
        state.lenbits = opts.bits;

        if (ret) {
          strm.msg = 'invalid code lengths set';
          state.mode = BAD$1;
          break;
        }
        //Tracev((stderr, "inflate:       code lengths ok\n"));
        state.have = 0;
        state.mode = CODELENS;
        /* falls through */
      case CODELENS:
        while (state.have < state.nlen + state.ndist) {
          for (;;) {
            here = state.lencode[hold & ((1 << state.lenbits) - 1)];/*BITS(state.lenbits)*/
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((here_bits) <= bits) { break; }
            //--- PULLBYTE() ---//
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          if (here_val < 16) {
            //--- DROPBITS(here.bits) ---//
            hold >>>= here_bits;
            bits -= here_bits;
            //---//
            state.lens[state.have++] = here_val;
          }
          else {
            if (here_val === 16) {
              //=== NEEDBITS(here.bits + 2);
              n = here_bits + 2;
              while (bits < n) {
                if (have === 0) { break inf_leave; }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              if (state.have === 0) {
                strm.msg = 'invalid bit length repeat';
                state.mode = BAD$1;
                break;
              }
              len = state.lens[state.have - 1];
              copy = 3 + (hold & 0x03);//BITS(2);
              //--- DROPBITS(2) ---//
              hold >>>= 2;
              bits -= 2;
              //---//
            }
            else if (here_val === 17) {
              //=== NEEDBITS(here.bits + 3);
              n = here_bits + 3;
              while (bits < n) {
                if (have === 0) { break inf_leave; }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              len = 0;
              copy = 3 + (hold & 0x07);//BITS(3);
              //--- DROPBITS(3) ---//
              hold >>>= 3;
              bits -= 3;
              //---//
            }
            else {
              //=== NEEDBITS(here.bits + 7);
              n = here_bits + 7;
              while (bits < n) {
                if (have === 0) { break inf_leave; }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              len = 0;
              copy = 11 + (hold & 0x7f);//BITS(7);
              //--- DROPBITS(7) ---//
              hold >>>= 7;
              bits -= 7;
              //---//
            }
            if (state.have + copy > state.nlen + state.ndist) {
              strm.msg = 'invalid bit length repeat';
              state.mode = BAD$1;
              break;
            }
            while (copy--) {
              state.lens[state.have++] = len;
            }
          }
        }

        /* handle error breaks in while */
        if (state.mode === BAD$1) { break; }

        /* check for end-of-block code (better have one) */
        if (state.lens[256] === 0) {
          strm.msg = 'invalid code -- missing end-of-block';
          state.mode = BAD$1;
          break;
        }

        /* build code tables -- note: do not change the lenbits or distbits
           values here (9 and 6) without reading the comments in inftrees.h
           concerning the ENOUGH constants, which depend on those values */
        state.lenbits = 9;

        opts = { bits: state.lenbits };
        ret = inftrees(LENS$1, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.lenbits = opts.bits;
        // state.lencode = state.next;

        if (ret) {
          strm.msg = 'invalid literal/lengths set';
          state.mode = BAD$1;
          break;
        }

        state.distbits = 6;
        //state.distcode.copy(state.codes);
        // Switch to use dynamic table
        state.distcode = state.distdyn;
        opts = { bits: state.distbits };
        ret = inftrees(DISTS$1, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.distbits = opts.bits;
        // state.distcode = state.next;

        if (ret) {
          strm.msg = 'invalid distances set';
          state.mode = BAD$1;
          break;
        }
        //Tracev((stderr, 'inflate:       codes ok\n'));
        state.mode = LEN_;
        if (flush === Z_TREES) { break inf_leave; }
        /* falls through */
      case LEN_:
        state.mode = LEN;
        /* falls through */
      case LEN:
        if (have >= 6 && left >= 258) {
          //--- RESTORE() ---
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          //---
          inffast(strm, _out);
          //--- LOAD() ---
          put = strm.next_out;
          output = strm.output;
          left = strm.avail_out;
          next = strm.next_in;
          input = strm.input;
          have = strm.avail_in;
          hold = state.hold;
          bits = state.bits;
          //---

          if (state.mode === TYPE$1) {
            state.back = -1;
          }
          break;
        }
        state.back = 0;
        for (;;) {
          here = state.lencode[hold & ((1 << state.lenbits) - 1)];  /*BITS(state.lenbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if (here_bits <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if (here_op && (here_op & 0xf0) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (;;) {
            here = state.lencode[last_val +
                    ((hold & ((1 << (last_bits + last_op)) - 1))/*BITS(last.bits + last.op)*/ >> last_bits)];
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((last_bits + here_bits) <= bits) { break; }
            //--- PULLBYTE() ---//
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          //--- DROPBITS(last.bits) ---//
          hold >>>= last_bits;
          bits -= last_bits;
          //---//
          state.back += last_bits;
        }
        //--- DROPBITS(here.bits) ---//
        hold >>>= here_bits;
        bits -= here_bits;
        //---//
        state.back += here_bits;
        state.length = here_val;
        if (here_op === 0) {
          //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
          //        "inflate:         literal '%c'\n" :
          //        "inflate:         literal 0x%02x\n", here.val));
          state.mode = LIT;
          break;
        }
        if (here_op & 32) {
          //Tracevv((stderr, "inflate:         end of block\n"));
          state.back = -1;
          state.mode = TYPE$1;
          break;
        }
        if (here_op & 64) {
          strm.msg = 'invalid literal/length code';
          state.mode = BAD$1;
          break;
        }
        state.extra = here_op & 15;
        state.mode = LENEXT;
        /* falls through */
      case LENEXT:
        if (state.extra) {
          //=== NEEDBITS(state.extra);
          n = state.extra;
          while (bits < n) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.length += hold & ((1 << state.extra) - 1)/*BITS(state.extra)*/;
          //--- DROPBITS(state.extra) ---//
          hold >>>= state.extra;
          bits -= state.extra;
          //---//
          state.back += state.extra;
        }
        //Tracevv((stderr, "inflate:         length %u\n", state.length));
        state.was = state.length;
        state.mode = DIST;
        /* falls through */
      case DIST:
        for (;;) {
          here = state.distcode[hold & ((1 << state.distbits) - 1)];/*BITS(state.distbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if ((here_bits) <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if ((here_op & 0xf0) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (;;) {
            here = state.distcode[last_val +
                    ((hold & ((1 << (last_bits + last_op)) - 1))/*BITS(last.bits + last.op)*/ >> last_bits)];
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((last_bits + here_bits) <= bits) { break; }
            //--- PULLBYTE() ---//
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          //--- DROPBITS(last.bits) ---//
          hold >>>= last_bits;
          bits -= last_bits;
          //---//
          state.back += last_bits;
        }
        //--- DROPBITS(here.bits) ---//
        hold >>>= here_bits;
        bits -= here_bits;
        //---//
        state.back += here_bits;
        if (here_op & 64) {
          strm.msg = 'invalid distance code';
          state.mode = BAD$1;
          break;
        }
        state.offset = here_val;
        state.extra = (here_op) & 15;
        state.mode = DISTEXT;
        /* falls through */
      case DISTEXT:
        if (state.extra) {
          //=== NEEDBITS(state.extra);
          n = state.extra;
          while (bits < n) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.offset += hold & ((1 << state.extra) - 1)/*BITS(state.extra)*/;
          //--- DROPBITS(state.extra) ---//
          hold >>>= state.extra;
          bits -= state.extra;
          //---//
          state.back += state.extra;
        }
//#ifdef INFLATE_STRICT
        if (state.offset > state.dmax) {
          strm.msg = 'invalid distance too far back';
          state.mode = BAD$1;
          break;
        }
//#endif
        //Tracevv((stderr, "inflate:         distance %u\n", state.offset));
        state.mode = MATCH;
        /* falls through */
      case MATCH:
        if (left === 0) { break inf_leave; }
        copy = _out - left;
        if (state.offset > copy) {         /* copy from window */
          copy = state.offset - copy;
          if (copy > state.whave) {
            if (state.sane) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD$1;
              break;
            }
// (!) This block is disabled in zlib defaults,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//          Trace((stderr, "inflate.c too far\n"));
//          copy -= state.whave;
//          if (copy > state.length) { copy = state.length; }
//          if (copy > left) { copy = left; }
//          left -= copy;
//          state.length -= copy;
//          do {
//            output[put++] = 0;
//          } while (--copy);
//          if (state.length === 0) { state.mode = LEN; }
//          break;
//#endif
          }
          if (copy > state.wnext) {
            copy -= state.wnext;
            from = state.wsize - copy;
          }
          else {
            from = state.wnext - copy;
          }
          if (copy > state.length) { copy = state.length; }
          from_source = state.window;
        }
        else {                              /* copy from output */
          from_source = output;
          from = put - state.offset;
          copy = state.length;
        }
        if (copy > left) { copy = left; }
        left -= copy;
        state.length -= copy;
        do {
          output[put++] = from_source[from++];
        } while (--copy);
        if (state.length === 0) { state.mode = LEN; }
        break;
      case LIT:
        if (left === 0) { break inf_leave; }
        output[put++] = state.length;
        left--;
        state.mode = LEN;
        break;
      case CHECK:
        if (state.wrap) {
          //=== NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) { break inf_leave; }
            have--;
            // Use '|' instead of '+' to make sure that result is signed
            hold |= input[next++] << bits;
            bits += 8;
          }
          //===//
          _out -= left;
          strm.total_out += _out;
          state.total += _out;
          if (_out) {
            strm.adler = state.check =
                /*UPDATE(state.check, put - _out, _out);*/
                (state.flags ? crc32_1(state.check, output, _out, put - _out) : adler32_1(state.check, output, _out, put - _out));

          }
          _out = left;
          // NB: crc32 stored as signed 32-bit int, zswap32 returns signed too
          if ((state.flags ? hold : zswap32(hold)) !== state.check) {
            strm.msg = 'incorrect data check';
            state.mode = BAD$1;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          //Tracev((stderr, "inflate:   check matches trailer\n"));
        }
        state.mode = LENGTH;
        /* falls through */
      case LENGTH:
        if (state.wrap && state.flags) {
          //=== NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          if (hold !== (state.total & 0xffffffff)) {
            strm.msg = 'incorrect length check';
            state.mode = BAD$1;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          //Tracev((stderr, "inflate:   length matches trailer\n"));
        }
        state.mode = DONE$1;
        /* falls through */
      case DONE$1:
        ret = Z_STREAM_END$2;
        break inf_leave;
      case BAD$1:
        ret = Z_DATA_ERROR$1;
        break inf_leave;
      case MEM:
        return Z_MEM_ERROR;
      case SYNC:
        /* falls through */
      default:
        return Z_STREAM_ERROR$1;
    }
  }

  // inf_leave <- here is real place for "goto inf_leave", emulated via "break inf_leave"

  /*
     Return from inflate(), updating the total counts and the check value.
     If there was no progress during the inflate() call, return a buffer
     error.  Call updatewindow() to create and/or update the window state.
     Note: a memory error from inflate() is non-recoverable.
   */

  //--- RESTORE() ---
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  //---

  if (state.wsize || (_out !== strm.avail_out && state.mode < BAD$1 &&
                      (state.mode < CHECK || flush !== Z_FINISH$2))) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap && _out) {
    strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
      (state.flags ? crc32_1(state.check, output, _out, strm.next_out - _out) : adler32_1(state.check, output, _out, strm.next_out - _out));
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) +
                    (state.mode === TYPE$1 ? 128 : 0) +
                    (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if (((_in === 0 && _out === 0) || flush === Z_FINISH$2) && ret === Z_OK$2) {
    ret = Z_BUF_ERROR$1;
  }
  return ret;
};


const inflateEnd = (strm) => {

  if (!strm || !strm.state /*|| strm->zfree == (free_func)0*/) {
    return Z_STREAM_ERROR$1;
  }

  let state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK$2;
};


const inflateGetHeader = (strm, head) => {

  /* check state */
  if (!strm || !strm.state) { return Z_STREAM_ERROR$1; }
  const state = strm.state;
  if ((state.wrap & 2) === 0) { return Z_STREAM_ERROR$1; }

  /* save header structure */
  state.head = head;
  head.done = false;
  return Z_OK$2;
};


const inflateSetDictionary = (strm, dictionary) => {
  const dictLength = dictionary.length;

  let state;
  let dictid;
  let ret;

  /* check state */
  if (!strm /* == Z_NULL */ || !strm.state /* == Z_NULL */) { return Z_STREAM_ERROR$1; }
  state = strm.state;

  if (state.wrap !== 0 && state.mode !== DICT) {
    return Z_STREAM_ERROR$1;
  }

  /* check for correct dictionary identifier */
  if (state.mode === DICT) {
    dictid = 1; /* adler32(0, null, 0)*/
    /* dictid = adler32(dictid, dictionary, dictLength); */
    dictid = adler32_1(dictid, dictionary, dictLength, 0);
    if (dictid !== state.check) {
      return Z_DATA_ERROR$1;
    }
  }
  /* copy dictionary to window using updatewindow(), which will amend the
   existing dictionary if appropriate */
  ret = updatewindow(strm, dictionary, dictLength, dictLength);
  if (ret) {
    state.mode = MEM;
    return Z_MEM_ERROR;
  }
  state.havedict = 1;
  // Tracev((stderr, "inflate:   dictionary set\n"));
  return Z_OK$2;
};


var inflateReset_1 = inflateReset;
var inflateReset2_1 = inflateReset2;
var inflateResetKeep_1 = inflateResetKeep;
var inflateInit_1 = inflateInit;
var inflateInit2_1 = inflateInit2;
var inflate_2 = inflate;
var inflateEnd_1 = inflateEnd;
var inflateGetHeader_1 = inflateGetHeader;
var inflateSetDictionary_1 = inflateSetDictionary;
var inflateInfo = 'pako inflate (from Nodeca project)';

/* Not implemented
module.exports.inflateCopy = inflateCopy;
module.exports.inflateGetDictionary = inflateGetDictionary;
module.exports.inflateMark = inflateMark;
module.exports.inflatePrime = inflatePrime;
module.exports.inflateSync = inflateSync;
module.exports.inflateSyncPoint = inflateSyncPoint;
module.exports.inflateUndermine = inflateUndermine;
*/

var inflate_1 = {
	inflateReset: inflateReset_1,
	inflateReset2: inflateReset2_1,
	inflateResetKeep: inflateResetKeep_1,
	inflateInit: inflateInit_1,
	inflateInit2: inflateInit2_1,
	inflate: inflate_2,
	inflateEnd: inflateEnd_1,
	inflateGetHeader: inflateGetHeader_1,
	inflateSetDictionary: inflateSetDictionary_1,
	inflateInfo: inflateInfo
};

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

function GZheader() {
  /* true if compressed data believed to be text */
  this.text       = 0;
  /* modification time */
  this.time       = 0;
  /* extra flags (not used when writing a gzip file) */
  this.xflags     = 0;
  /* operating system */
  this.os         = 0;
  /* pointer to extra field or Z_NULL if none */
  this.extra      = null;
  /* extra field length (valid if extra != Z_NULL) */
  this.extra_len  = 0; // Actually, we don't need it in JS,
                       // but leave for few code modifications

  //
  // Setup limits is not necessary because in js we should not preallocate memory
  // for inflate use constant limit in 65536 bytes
  //

  /* space at extra (only when reading header) */
  // this.extra_max  = 0;
  /* pointer to zero-terminated file name or Z_NULL */
  this.name       = '';
  /* space at name (only when reading header) */
  // this.name_max   = 0;
  /* pointer to zero-terminated comment or Z_NULL */
  this.comment    = '';
  /* space at comment (only when reading header) */
  // this.comm_max   = 0;
  /* true if there was or will be a header crc */
  this.hcrc       = 0;
  /* true when done reading gzip header (not used when writing a gzip file) */
  this.done       = false;
}

var gzheader = GZheader;

const toString$1$1 = Object.prototype.toString;

/* Public constants ==========================================================*/
/* ===========================================================================*/

const {
  Z_NO_FLUSH: Z_NO_FLUSH$2, Z_FINISH: Z_FINISH$3,
  Z_OK: Z_OK$3, Z_STREAM_END: Z_STREAM_END$3, Z_NEED_DICT: Z_NEED_DICT$1, Z_STREAM_ERROR: Z_STREAM_ERROR$2, Z_DATA_ERROR: Z_DATA_ERROR$2, Z_MEM_ERROR: Z_MEM_ERROR$1
} = constants;

/* ===========================================================================*/


/**
 * class Inflate
 *
 * Generic JS-style wrapper for zlib calls. If you don't need
 * streaming behaviour - use more simple functions: [[inflate]]
 * and [[inflateRaw]].
 **/

/* internal
 * inflate.chunks -> Array
 *
 * Chunks of output data, if [[Inflate#onData]] not overridden.
 **/

/**
 * Inflate.result -> Uint8Array|String
 *
 * Uncompressed result, generated by default [[Inflate#onData]]
 * and [[Inflate#onEnd]] handlers. Filled after you push last chunk
 * (call [[Inflate#push]] with `Z_FINISH` / `true` param).
 **/

/**
 * Inflate.err -> Number
 *
 * Error code after inflate finished. 0 (Z_OK) on success.
 * Should be checked if broken data possible.
 **/

/**
 * Inflate.msg -> String
 *
 * Error message, if [[Inflate.err]] != 0
 **/


/**
 * new Inflate(options)
 * - options (Object): zlib inflate options.
 *
 * Creates new inflator instance with specified params. Throws exception
 * on bad params. Supported options:
 *
 * - `windowBits`
 * - `dictionary`
 *
 * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
 * for more information on these.
 *
 * Additional options, for internal needs:
 *
 * - `chunkSize` - size of generated data chunks (16K by default)
 * - `raw` (Boolean) - do raw inflate
 * - `to` (String) - if equal to 'string', then result will be converted
 *   from utf8 to utf16 (javascript) string. When string output requested,
 *   chunk length can differ from `chunkSize`, depending on content.
 *
 * By default, when no options set, autodetect deflate/gzip data format via
 * wrapper header.
 *
 * ##### Example:
 *
 * ```javascript
 * const pako = require('pako')
 * const chunk1 = new Uint8Array([1,2,3,4,5,6,7,8,9])
 * const chunk2 = new Uint8Array([10,11,12,13,14,15,16,17,18,19]);
 *
 * const inflate = new pako.Inflate({ level: 3});
 *
 * inflate.push(chunk1, false);
 * inflate.push(chunk2, true);  // true -> last chunk
 *
 * if (inflate.err) { throw new Error(inflate.err); }
 *
 * console.log(inflate.result);
 * ```
 **/
function Inflate(options) {
  this.options = common.assign({
    chunkSize: 1024 * 64,
    windowBits: 15,
    to: ''
  }, options || {});

  const opt = this.options;

  // Force window size for `raw` data, if not set directly,
  // because we have no header for autodetect.
  if (opt.raw && (opt.windowBits >= 0) && (opt.windowBits < 16)) {
    opt.windowBits = -opt.windowBits;
    if (opt.windowBits === 0) { opt.windowBits = -15; }
  }

  // If `windowBits` not defined (and mode not raw) - set autodetect flag for gzip/deflate
  if ((opt.windowBits >= 0) && (opt.windowBits < 16) &&
      !(options && options.windowBits)) {
    opt.windowBits += 32;
  }

  // Gzip header has no info about windows size, we can do autodetect only
  // for deflate. So, if window size not set, force it to max when gzip possible
  if ((opt.windowBits > 15) && (opt.windowBits < 48)) {
    // bit 3 (16) -> gzipped data
    // bit 4 (32) -> autodetect gzip/deflate
    if ((opt.windowBits & 15) === 0) {
      opt.windowBits |= 15;
    }
  }

  this.err    = 0;      // error code, if happens (0 = Z_OK)
  this.msg    = '';     // error message
  this.ended  = false;  // used to avoid multiple onEnd() calls
  this.chunks = [];     // chunks of compressed data

  this.strm   = new zstream();
  this.strm.avail_out = 0;

  let status  = inflate_1.inflateInit2(
    this.strm,
    opt.windowBits
  );

  if (status !== Z_OK$3) {
    throw new Error(messages[status]);
  }

  this.header = new gzheader();

  inflate_1.inflateGetHeader(this.strm, this.header);

  // Setup dictionary
  if (opt.dictionary) {
    // Convert data if needed
    if (typeof opt.dictionary === 'string') {
      opt.dictionary = strings.string2buf(opt.dictionary);
    } else if (toString$1$1.call(opt.dictionary) === '[object ArrayBuffer]') {
      opt.dictionary = new Uint8Array(opt.dictionary);
    }
    if (opt.raw) { //In raw mode we need to set the dictionary early
      status = inflate_1.inflateSetDictionary(this.strm, opt.dictionary);
      if (status !== Z_OK$3) {
        throw new Error(messages[status]);
      }
    }
  }
}

/**
 * Inflate#push(data[, flush_mode]) -> Boolean
 * - data (Uint8Array|ArrayBuffer): input data
 * - flush_mode (Number|Boolean): 0..6 for corresponding Z_NO_FLUSH..Z_TREE
 *   flush modes. See constants. Skipped or `false` means Z_NO_FLUSH,
 *   `true` means Z_FINISH.
 *
 * Sends input data to inflate pipe, generating [[Inflate#onData]] calls with
 * new output chunks. Returns `true` on success. If end of stream detected,
 * [[Inflate#onEnd]] will be called.
 *
 * `flush_mode` is not needed for normal operation, because end of stream
 * detected automatically. You may try to use it for advanced things, but
 * this functionality was not tested.
 *
 * On fail call [[Inflate#onEnd]] with error code and return false.
 *
 * ##### Example
 *
 * ```javascript
 * push(chunk, false); // push one of data chunks
 * ...
 * push(chunk, true);  // push last chunk
 * ```
 **/
Inflate.prototype.push = function (data, flush_mode) {
  const strm = this.strm;
  const chunkSize = this.options.chunkSize;
  const dictionary = this.options.dictionary;
  let status, _flush_mode, last_avail_out;

  if (this.ended) return false;

  if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;
  else _flush_mode = flush_mode === true ? Z_FINISH$3 : Z_NO_FLUSH$2;

  // Convert data if needed
  if (toString$1$1.call(data) === '[object ArrayBuffer]') {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }

  strm.next_in = 0;
  strm.avail_in = strm.input.length;

  for (;;) {
    if (strm.avail_out === 0) {
      strm.output = new Uint8Array(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }

    status = inflate_1.inflate(strm, _flush_mode);

    if (status === Z_NEED_DICT$1 && dictionary) {
      status = inflate_1.inflateSetDictionary(strm, dictionary);

      if (status === Z_OK$3) {
        status = inflate_1.inflate(strm, _flush_mode);
      } else if (status === Z_DATA_ERROR$2) {
        // Replace code with more verbose
        status = Z_NEED_DICT$1;
      }
    }

    // Skip snyc markers if more data follows and not raw mode
    while (strm.avail_in > 0 &&
           status === Z_STREAM_END$3 &&
           strm.state.wrap > 0 &&
           data[strm.next_in] !== 0)
    {
      inflate_1.inflateReset(strm);
      status = inflate_1.inflate(strm, _flush_mode);
    }

    switch (status) {
      case Z_STREAM_ERROR$2:
      case Z_DATA_ERROR$2:
      case Z_NEED_DICT$1:
      case Z_MEM_ERROR$1:
        this.onEnd(status);
        this.ended = true;
        return false;
    }

    // Remember real `avail_out` value, because we may patch out buffer content
    // to align utf8 strings boundaries.
    last_avail_out = strm.avail_out;

    if (strm.next_out) {
      if (strm.avail_out === 0 || status === Z_STREAM_END$3) {

        if (this.options.to === 'string') {

          let next_out_utf8 = strings.utf8border(strm.output, strm.next_out);

          let tail = strm.next_out - next_out_utf8;
          let utf8str = strings.buf2string(strm.output, next_out_utf8);

          // move tail & realign counters
          strm.next_out = tail;
          strm.avail_out = chunkSize - tail;
          if (tail) strm.output.set(strm.output.subarray(next_out_utf8, next_out_utf8 + tail), 0);

          this.onData(utf8str);

        } else {
          this.onData(strm.output.length === strm.next_out ? strm.output : strm.output.subarray(0, strm.next_out));
        }
      }
    }

    // Must repeat iteration if out buffer is full
    if (status === Z_OK$3 && last_avail_out === 0) continue;

    // Finalize if end of stream reached.
    if (status === Z_STREAM_END$3) {
      status = inflate_1.inflateEnd(this.strm);
      this.onEnd(status);
      this.ended = true;
      return true;
    }

    if (strm.avail_in === 0) break;
  }

  return true;
};


/**
 * Inflate#onData(chunk) -> Void
 * - chunk (Uint8Array|String): output data. When string output requested,
 *   each chunk will be string.
 *
 * By default, stores data blocks in `chunks[]` property and glue
 * those in `onEnd`. Override this handler, if you need another behaviour.
 **/
Inflate.prototype.onData = function (chunk) {
  this.chunks.push(chunk);
};


/**
 * Inflate#onEnd(status) -> Void
 * - status (Number): inflate status. 0 (Z_OK) on success,
 *   other if not.
 *
 * Called either after you tell inflate that the input stream is
 * complete (Z_FINISH). By default - join collected chunks,
 * free memory and fill `results` / `err` properties.
 **/
Inflate.prototype.onEnd = function (status) {
  // On success - join
  if (status === Z_OK$3) {
    if (this.options.to === 'string') {
      this.result = this.chunks.join('');
    } else {
      this.result = common.flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};


/**
 * inflate(data[, options]) -> Uint8Array|String
 * - data (Uint8Array): input data to decompress.
 * - options (Object): zlib inflate options.
 *
 * Decompress `data` with inflate/ungzip and `options`. Autodetect
 * format via wrapper header by default. That's why we don't provide
 * separate `ungzip` method.
 *
 * Supported options are:
 *
 * - windowBits
 *
 * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
 * for more information.
 *
 * Sugar (options):
 *
 * - `raw` (Boolean) - say that we work with raw stream, if you don't wish to specify
 *   negative windowBits implicitly.
 * - `to` (String) - if equal to 'string', then result will be converted
 *   from utf8 to utf16 (javascript) string. When string output requested,
 *   chunk length can differ from `chunkSize`, depending on content.
 *
 *
 * ##### Example:
 *
 * ```javascript
 * const pako = require('pako');
 * const input = pako.deflate(new Uint8Array([1,2,3,4,5,6,7,8,9]));
 * let output;
 *
 * try {
 *   output = pako.inflate(input);
 * } catch (err)
 *   console.log(err);
 * }
 * ```
 **/
function inflate$1(input, options) {
  const inflator = new Inflate(options);

  inflator.push(input);

  // That will never happens, if you don't cheat with options :)
  if (inflator.err) throw inflator.msg || messages[inflator.err];

  return inflator.result;
}


/**
 * inflateRaw(data[, options]) -> Uint8Array|String
 * - data (Uint8Array): input data to decompress.
 * - options (Object): zlib inflate options.
 *
 * The same as [[inflate]], but creates raw data, without wrapper
 * (header and adler32 crc).
 **/
function inflateRaw(input, options) {
  options = options || {};
  options.raw = true;
  return inflate$1(input, options);
}


/**
 * ungzip(data[, options]) -> Uint8Array|String
 * - data (Uint8Array): input data to decompress.
 * - options (Object): zlib inflate options.
 *
 * Just shortcut to [[inflate]], because it autodetects format
 * by header.content. Done for convenience.
 **/


var Inflate_1 = Inflate;
var inflate_2$1 = inflate$1;
var inflateRaw_1 = inflateRaw;
var ungzip = inflate$1;
var constants$2 = constants;

var inflate_1$1 = {
	Inflate: Inflate_1,
	inflate: inflate_2$1,
	inflateRaw: inflateRaw_1,
	ungzip: ungzip,
	constants: constants$2
};

const { Deflate: Deflate$1, deflate: deflate$2, deflateRaw: deflateRaw$1, gzip: gzip$1 } = deflate_1$1;

const { Inflate: Inflate$1, inflate: inflate$2, inflateRaw: inflateRaw$1, ungzip: ungzip$1 } = inflate_1$1;



var Deflate_1$1 = Deflate$1;
var deflate_1$2 = deflate$2;
var deflateRaw_1$1 = deflateRaw$1;
var gzip_1$1 = gzip$1;
var Inflate_1$1 = Inflate$1;
var inflate_1$2 = inflate$2;
var inflateRaw_1$1 = inflateRaw$1;
var ungzip_1 = ungzip$1;
var constants_1 = constants;

var pako = {
	Deflate: Deflate_1$1,
	deflate: deflate_1$2,
	deflateRaw: deflateRaw_1$1,
	gzip: gzip_1$1,
	Inflate: Inflate_1$1,
	inflate: inflate_1$2,
	inflateRaw: inflateRaw_1$1,
	ungzip: ungzip_1,
	constants: constants_1
};

var _a$2;
const GZip = (_a$2 = class {
  constructor(level = 1) {
    if (level < 0 || level > 9) {
      throw new Error("Invalid gzip compression level, it should be between 0 and 9");
    }
    this.level = level;
  }
  static fromConfig({ level }) {
    return new _a$2(level);
  }
  encode(data) {
    const gzipped = pako.gzip(data, { level: this.level });
    return gzipped;
  }
  decode(data, out) {
    const uncompressed = pako.ungzip(data);
    if (out !== void 0) {
      out.set(uncompressed);
      return out;
    }
    return uncompressed;
  }
}, _a$2.codecId = "gzip", _a$2);

var GZip$1 = GZip;

var _a$1;
const Zlib = (_a$1 = class {
  constructor(level = 1) {
    if (level < -1 || level > 9) {
      throw new Error("Invalid zlib compression level, it should be between -1 and 9");
    }
    this.level = level;
  }
  static fromConfig({ level }) {
    return new _a$1(level);
  }
  encode(data) {
    const gzipped = pako.deflate(data, { level: this.level });
    return gzipped;
  }
  decode(data, out) {
    const uncompressed = pako.inflate(data);
    if (out !== void 0) {
      out.set(uncompressed);
      return out;
    }
    return uncompressed;
  }
}, _a$1.codecId = "zlib", _a$1);

var Zlib$1 = Zlib;

var blosc_codec = function() {
  typeof document !== "undefined" && document.currentScript ? document.currentScript.src : void 0;
  return function(blosc_codec2) {
    blosc_codec2 = blosc_codec2 || {};
    var f;
    f || (f = typeof blosc_codec2 !== "undefined" ? blosc_codec2 : {});
    var aa, ba;
    f.ready = new Promise(function(a, b) {
      aa = a;
      ba = b;
    });
    var r = {}, t;
    for (t in f)
      f.hasOwnProperty(t) && (r[t] = f[t]);
    var ca = "./this.program", da = f.print || console.log.bind(console), u = f.printErr || console.warn.bind(console);
    for (t in r)
      r.hasOwnProperty(t) && (f[t] = r[t]);
    r = null;
    f.thisProgram && (ca = f.thisProgram);
    var v;
    f.wasmBinary && (v = f.wasmBinary);
    f.noExitRuntime && (f.noExitRuntime);
    typeof WebAssembly !== "object" && w("no native wasm support detected");
    var y, ea = false, fa = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : void 0;
    function ha(a, b, c) {
      var d = b + c;
      for (c = b; a[c] && !(c >= d); )
        ++c;
      if (16 < c - b && a.subarray && fa)
        return fa.decode(a.subarray(b, c));
      for (d = ""; b < c; ) {
        var e = a[b++];
        if (e & 128) {
          var g = a[b++] & 63;
          if ((e & 224) == 192)
            d += String.fromCharCode((e & 31) << 6 | g);
          else {
            var k = a[b++] & 63;
            e = (e & 240) == 224 ? (e & 15) << 12 | g << 6 | k : (e & 7) << 18 | g << 12 | k << 6 | a[b++] & 63;
            65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023));
          }
        } else
          d += String.fromCharCode(e);
      }
      return d;
    }
    function ia(a, b, c) {
      var d = z;
      if (0 < c) {
        c = b + c - 1;
        for (var e = 0; e < a.length; ++e) {
          var g = a.charCodeAt(e);
          if (55296 <= g && 57343 >= g) {
            var k = a.charCodeAt(++e);
            g = 65536 + ((g & 1023) << 10) | k & 1023;
          }
          if (127 >= g) {
            if (b >= c)
              break;
            d[b++] = g;
          } else {
            if (2047 >= g) {
              if (b + 1 >= c)
                break;
              d[b++] = 192 | g >> 6;
            } else {
              if (65535 >= g) {
                if (b + 2 >= c)
                  break;
                d[b++] = 224 | g >> 12;
              } else {
                if (b + 3 >= c)
                  break;
                d[b++] = 240 | g >> 18;
                d[b++] = 128 | g >> 12 & 63;
              }
              d[b++] = 128 | g >> 6 & 63;
            }
            d[b++] = 128 | g & 63;
          }
        }
        d[b] = 0;
      }
    }
    var ja = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : void 0;
    function ka(a, b) {
      var c = a >> 1;
      for (var d = c + b / 2; !(c >= d) && A[c]; )
        ++c;
      c <<= 1;
      if (32 < c - a && ja)
        return ja.decode(z.subarray(a, c));
      c = 0;
      for (d = ""; ; ) {
        var e = C[a + 2 * c >> 1];
        if (e == 0 || c == b / 2)
          return d;
        ++c;
        d += String.fromCharCode(e);
      }
    }
    function la(a, b, c) {
      c === void 0 && (c = 2147483647);
      if (2 > c)
        return 0;
      c -= 2;
      var d = b;
      c = c < 2 * a.length ? c / 2 : a.length;
      for (var e = 0; e < c; ++e)
        C[b >> 1] = a.charCodeAt(e), b += 2;
      C[b >> 1] = 0;
      return b - d;
    }
    function ma(a) {
      return 2 * a.length;
    }
    function na(a, b) {
      for (var c = 0, d = ""; !(c >= b / 4); ) {
        var e = D[a + 4 * c >> 2];
        if (e == 0)
          break;
        ++c;
        65536 <= e ? (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023)) : d += String.fromCharCode(e);
      }
      return d;
    }
    function oa(a, b, c) {
      c === void 0 && (c = 2147483647);
      if (4 > c)
        return 0;
      var d = b;
      c = d + c - 4;
      for (var e = 0; e < a.length; ++e) {
        var g = a.charCodeAt(e);
        if (55296 <= g && 57343 >= g) {
          var k = a.charCodeAt(++e);
          g = 65536 + ((g & 1023) << 10) | k & 1023;
        }
        D[b >> 2] = g;
        b += 4;
        if (b + 4 > c)
          break;
      }
      D[b >> 2] = 0;
      return b - d;
    }
    function pa(a) {
      for (var b = 0, c = 0; c < a.length; ++c) {
        var d = a.charCodeAt(c);
        55296 <= d && 57343 >= d && ++c;
        b += 4;
      }
      return b;
    }
    var E, F, z, C, A, D, G, qa, ra;
    function sa(a) {
      E = a;
      f.HEAP8 = F = new Int8Array(a);
      f.HEAP16 = C = new Int16Array(a);
      f.HEAP32 = D = new Int32Array(a);
      f.HEAPU8 = z = new Uint8Array(a);
      f.HEAPU16 = A = new Uint16Array(a);
      f.HEAPU32 = G = new Uint32Array(a);
      f.HEAPF32 = qa = new Float32Array(a);
      f.HEAPF64 = ra = new Float64Array(a);
    }
    var ta = f.INITIAL_MEMORY || 16777216;
    f.wasmMemory ? y = f.wasmMemory : y = new WebAssembly.Memory({ initial: ta / 65536, maximum: 32768 });
    y && (E = y.buffer);
    ta = E.byteLength;
    sa(E);
    var I, ua = [], va = [], wa = [], xa = [];
    function ya() {
      var a = f.preRun.shift();
      ua.unshift(a);
    }
    var J = 0, K = null;
    f.preloadedImages = {};
    f.preloadedAudios = {};
    function w(a) {
      if (f.onAbort)
        f.onAbort(a);
      u(a);
      ea = true;
      a = new WebAssembly.RuntimeError("abort(" + a + "). Build with -s ASSERTIONS=1 for more info.");
      ba(a);
      throw a;
    }
    function Aa(a) {
      var b = L;
      return String.prototype.startsWith ? b.startsWith(a) : b.indexOf(a) === 0;
    }
    function Ba() {
      return Aa("data:application/octet-stream;base64,");
    }
    var L = "blosc_codec.wasm";
    if (!Ba()) {
      var Ca = L;
      L = f.locateFile ? f.locateFile(Ca, "") : "" + Ca;
    }
    function Da() {
      try {
        if (v)
          return new Uint8Array(v);
        throw "both async and sync fetching of the wasm failed";
      } catch (a) {
        w(a);
      }
    }
    function N(a) {
      for (; 0 < a.length; ) {
        var b = a.shift();
        if (typeof b == "function")
          b(f);
        else {
          var c = b.T;
          typeof c === "number" ? b.O === void 0 ? I.get(c)() : I.get(c)(b.O) : c(b.O === void 0 ? null : b.O);
        }
      }
    }
    function Ea(a) {
      this.N = a - 16;
      this.$ = function(b) {
        D[this.N + 8 >> 2] = b;
      };
      this.X = function(b) {
        D[this.N + 0 >> 2] = b;
      };
      this.Y = function() {
        D[this.N + 4 >> 2] = 0;
      };
      this.W = function() {
        F[this.N + 12 >> 0] = 0;
      };
      this.Z = function() {
        F[this.N + 13 >> 0] = 0;
      };
      this.V = function(b, c) {
        this.$(b);
        this.X(c);
        this.Y();
        this.W();
        this.Z();
      };
    }
    function Fa(a) {
      switch (a) {
        case 1:
          return 0;
        case 2:
          return 1;
        case 4:
          return 2;
        case 8:
          return 3;
        default:
          throw new TypeError("Unknown type size: " + a);
      }
    }
    var Ga = void 0;
    function P(a) {
      for (var b = ""; z[a]; )
        b += Ga[z[a++]];
      return b;
    }
    var Q = {}, R = {}, S = {};
    function Ha(a) {
      if (a === void 0)
        return "_unknown";
      a = a.replace(/[^a-zA-Z0-9_]/g, "$");
      var b = a.charCodeAt(0);
      return 48 <= b && 57 >= b ? "_" + a : a;
    }
    function Ia(a, b) {
      a = Ha(a);
      return new Function("body", "return function " + a + '() {\n    "use strict";    return body.apply(this, arguments);\n};\n')(b);
    }
    function Ja(a) {
      var b = Error, c = Ia(a, function(d) {
        this.name = a;
        this.message = d;
        d = Error(d).stack;
        d !== void 0 && (this.stack = this.toString() + "\n" + d.replace(/^Error(:[^\n]*)?\n/, ""));
      });
      c.prototype = Object.create(b.prototype);
      c.prototype.constructor = c;
      c.prototype.toString = function() {
        return this.message === void 0 ? this.name : this.name + ": " + this.message;
      };
      return c;
    }
    var Ka = void 0;
    function T(a) {
      throw new Ka(a);
    }
    var La = void 0;
    function Ma(a, b) {
      function c(h) {
        h = b(h);
        if (h.length !== d.length)
          throw new La("Mismatched type converter count");
        for (var l = 0; l < d.length; ++l)
          U(d[l], h[l]);
      }
      var d = [];
      d.forEach(function(h) {
        S[h] = a;
      });
      var e = Array(a.length), g = [], k = 0;
      a.forEach(function(h, l) {
        R.hasOwnProperty(h) ? e[l] = R[h] : (g.push(h), Q.hasOwnProperty(h) || (Q[h] = []), Q[h].push(function() {
          e[l] = R[h];
          ++k;
          k === g.length && c(e);
        }));
      });
      g.length === 0 && c(e);
    }
    function U(a, b, c) {
      c = c || {};
      if (!("argPackAdvance" in b))
        throw new TypeError("registerType registeredInstance requires argPackAdvance");
      var d = b.name;
      a || T('type "' + d + '" must have a positive integer typeid pointer');
      if (R.hasOwnProperty(a)) {
        if (c.U)
          return;
        T("Cannot register type '" + d + "' twice");
      }
      R[a] = b;
      delete S[a];
      Q.hasOwnProperty(a) && (b = Q[a], delete Q[a], b.forEach(function(e) {
        e();
      }));
    }
    var Na = [], V = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }];
    function Qa(a) {
      4 < a && --V[a].P === 0 && (V[a] = void 0, Na.push(a));
    }
    function Ra(a) {
      switch (a) {
        case void 0:
          return 1;
        case null:
          return 2;
        case true:
          return 3;
        case false:
          return 4;
        default:
          var b = Na.length ? Na.pop() : V.length;
          V[b] = { P: 1, value: a };
          return b;
      }
    }
    function Sa(a) {
      return this.fromWireType(G[a >> 2]);
    }
    function Ta(a) {
      if (a === null)
        return "null";
      var b = typeof a;
      return b === "object" || b === "array" || b === "function" ? a.toString() : "" + a;
    }
    function Ua(a, b) {
      switch (b) {
        case 2:
          return function(c) {
            return this.fromWireType(qa[c >> 2]);
          };
        case 3:
          return function(c) {
            return this.fromWireType(ra[c >> 3]);
          };
        default:
          throw new TypeError("Unknown float type: " + a);
      }
    }
    function Va(a) {
      var b = Function;
      if (!(b instanceof Function))
        throw new TypeError("new_ called with constructor type " + typeof b + " which is not a function");
      var c = Ia(b.name || "unknownFunctionName", function() {
      });
      c.prototype = b.prototype;
      c = new c();
      a = b.apply(c, a);
      return a instanceof Object ? a : c;
    }
    function Wa(a) {
      for (; a.length; ) {
        var b = a.pop();
        a.pop()(b);
      }
    }
    function Xa(a, b) {
      var c = f;
      if (c[a].L === void 0) {
        var d = c[a];
        c[a] = function() {
          c[a].L.hasOwnProperty(arguments.length) || T("Function '" + b + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + c[a].L + ")!");
          return c[a].L[arguments.length].apply(this, arguments);
        };
        c[a].L = [];
        c[a].L[d.S] = d;
      }
    }
    function Ya(a, b, c) {
      f.hasOwnProperty(a) ? ((c === void 0 || f[a].L !== void 0 && f[a].L[c] !== void 0) && T("Cannot register public name '" + a + "' twice"), Xa(a, a), f.hasOwnProperty(c) && T("Cannot register multiple overloads of a function with the same number of arguments (" + c + ")!"), f[a].L[c] = b) : (f[a] = b, c !== void 0 && (f[a].ba = c));
    }
    function Za(a, b) {
      for (var c = [], d = 0; d < a; d++)
        c.push(D[(b >> 2) + d]);
      return c;
    }
    function $a(a, b) {
      0 <= a.indexOf("j") || w("Assertion failed: getDynCaller should only be called with i64 sigs");
      var c = [];
      return function() {
        c.length = arguments.length;
        for (var d = 0; d < arguments.length; d++)
          c[d] = arguments[d];
        var e;
        a.indexOf("j") != -1 ? e = c && c.length ? f["dynCall_" + a].apply(null, [b].concat(c)) : f["dynCall_" + a].call(null, b) : e = I.get(b).apply(null, c);
        return e;
      };
    }
    function ab(a, b) {
      a = P(a);
      var c = a.indexOf("j") != -1 ? $a(a, b) : I.get(b);
      typeof c !== "function" && T("unknown function pointer with signature " + a + ": " + b);
      return c;
    }
    var bb = void 0;
    function cb(a) {
      a = db(a);
      var b = P(a);
      W(a);
      return b;
    }
    function eb(a, b) {
      function c(g) {
        e[g] || R[g] || (S[g] ? S[g].forEach(c) : (d.push(g), e[g] = true));
      }
      var d = [], e = {};
      b.forEach(c);
      throw new bb(a + ": " + d.map(cb).join([", "]));
    }
    function fb(a, b, c) {
      switch (b) {
        case 0:
          return c ? function(d) {
            return F[d];
          } : function(d) {
            return z[d];
          };
        case 1:
          return c ? function(d) {
            return C[d >> 1];
          } : function(d) {
            return A[d >> 1];
          };
        case 2:
          return c ? function(d) {
            return D[d >> 2];
          } : function(d) {
            return G[d >> 2];
          };
        default:
          throw new TypeError("Unknown integer type: " + a);
      }
    }
    var gb = {};
    function hb() {
      if (!ib) {
        var a = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: (typeof navigator === "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8", _: ca || "./this.program" }, b;
        for (b in gb)
          a[b] = gb[b];
        var c = [];
        for (b in a)
          c.push(b + "=" + a[b]);
        ib = c;
      }
      return ib;
    }
    for (var ib, jb = [null, [], []], kb = Array(256), X = 0; 256 > X; ++X)
      kb[X] = String.fromCharCode(X);
    Ga = kb;
    Ka = f.BindingError = Ja("BindingError");
    La = f.InternalError = Ja("InternalError");
    f.count_emval_handles = function() {
      for (var a = 0, b = 5; b < V.length; ++b)
        V[b] !== void 0 && ++a;
      return a;
    };
    f.get_first_emval = function() {
      for (var a = 5; a < V.length; ++a)
        if (V[a] !== void 0)
          return V[a];
      return null;
    };
    bb = f.UnboundTypeError = Ja("UnboundTypeError");
    va.push({ T: function() {
      lb();
    } });
    var mb = { p: function(a) {
      return Y(a + 16) + 16;
    }, o: function(a, b, c) {
      new Ea(a).V(b, c);
      throw a;
    }, z: function(a, b, c, d, e) {
      var g = Fa(c);
      b = P(b);
      U(a, { name: b, fromWireType: function(k) {
        return !!k;
      }, toWireType: function(k, h) {
        return h ? d : e;
      }, argPackAdvance: 8, readValueFromPointer: function(k) {
        if (c === 1)
          var h = F;
        else if (c === 2)
          h = C;
        else if (c === 4)
          h = D;
        else
          throw new TypeError("Unknown boolean type size: " + b);
        return this.fromWireType(h[k >> g]);
      }, M: null });
    }, y: function(a, b) {
      b = P(b);
      U(a, { name: b, fromWireType: function(c) {
        var d = V[c].value;
        Qa(c);
        return d;
      }, toWireType: function(c, d) {
        return Ra(d);
      }, argPackAdvance: 8, readValueFromPointer: Sa, M: null });
    }, h: function(a, b, c) {
      c = Fa(c);
      b = P(b);
      U(a, { name: b, fromWireType: function(d) {
        return d;
      }, toWireType: function(d, e) {
        if (typeof e !== "number" && typeof e !== "boolean")
          throw new TypeError('Cannot convert "' + Ta(e) + '" to ' + this.name);
        return e;
      }, argPackAdvance: 8, readValueFromPointer: Ua(b, c), M: null });
    }, e: function(a, b, c, d, e, g) {
      var k = Za(b, c);
      a = P(a);
      e = ab(d, e);
      Ya(a, function() {
        eb("Cannot call " + a + " due to unbound types", k);
      }, b - 1);
      Ma(k, function(h) {
        var l = a, n = a;
        h = [h[0], null].concat(h.slice(1));
        var p = e, q = h.length;
        2 > q && T("argTypes array size mismatch! Must at least get return value and 'this' types!");
        for (var x = h[1] !== null && false, B = false, m = 1; m < h.length; ++m)
          if (h[m] !== null && h[m].M === void 0) {
            B = true;
            break;
          }
        var Oa = h[0].name !== "void", H = "", M = "";
        for (m = 0; m < q - 2; ++m)
          H += (m !== 0 ? ", " : "") + "arg" + m, M += (m !== 0 ? ", " : "") + "arg" + m + "Wired";
        n = "return function " + Ha(n) + "(" + H + ") {\nif (arguments.length !== " + (q - 2) + ") {\nthrowBindingError('function " + n + " called with ' + arguments.length + ' arguments, expected " + (q - 2) + " args!');\n}\n";
        B && (n += "var destructors = [];\n");
        var Pa = B ? "destructors" : "null";
        H = "throwBindingError invoker fn runDestructors retType classParam".split(" ");
        p = [T, p, g, Wa, h[0], h[1]];
        x && (n += "var thisWired = classParam.toWireType(" + Pa + ", this);\n");
        for (m = 0; m < q - 2; ++m)
          n += "var arg" + m + "Wired = argType" + m + ".toWireType(" + Pa + ", arg" + m + "); // " + h[m + 2].name + "\n", H.push("argType" + m), p.push(h[m + 2]);
        x && (M = "thisWired" + (0 < M.length ? ", " : "") + M);
        n += (Oa ? "var rv = " : "") + "invoker(fn" + (0 < M.length ? ", " : "") + M + ");\n";
        if (B)
          n += "runDestructors(destructors);\n";
        else
          for (m = x ? 1 : 2; m < h.length; ++m)
            q = m === 1 ? "thisWired" : "arg" + (m - 2) + "Wired", h[m].M !== null && (n += q + "_dtor(" + q + "); // " + h[m].name + "\n", H.push(q + "_dtor"), p.push(h[m].M));
        Oa && (n += "var ret = retType.fromWireType(rv);\nreturn ret;\n");
        H.push(n + "}\n");
        h = Va(H).apply(null, p);
        m = b - 1;
        if (!f.hasOwnProperty(l))
          throw new La("Replacing nonexistant public symbol");
        f[l].L !== void 0 && m !== void 0 ? f[l].L[m] = h : (f[l] = h, f[l].S = m);
        return [];
      });
    }, c: function(a, b, c, d, e) {
      function g(n) {
        return n;
      }
      b = P(b);
      e === -1 && (e = 4294967295);
      var k = Fa(c);
      if (d === 0) {
        var h = 32 - 8 * c;
        g = function(n) {
          return n << h >>> h;
        };
      }
      var l = b.indexOf("unsigned") != -1;
      U(a, { name: b, fromWireType: g, toWireType: function(n, p) {
        if (typeof p !== "number" && typeof p !== "boolean")
          throw new TypeError('Cannot convert "' + Ta(p) + '" to ' + this.name);
        if (p < d || p > e)
          throw new TypeError('Passing a number "' + Ta(p) + '" from JS side to C/C++ side to an argument of type "' + b + '", which is outside the valid range [' + d + ", " + e + "]!");
        return l ? p >>> 0 : p | 0;
      }, argPackAdvance: 8, readValueFromPointer: fb(b, k, d !== 0), M: null });
    }, b: function(a, b, c) {
      function d(g) {
        g >>= 2;
        var k = G;
        return new e(E, k[g + 1], k[g]);
      }
      var e = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][b];
      c = P(c);
      U(a, { name: c, fromWireType: d, argPackAdvance: 8, readValueFromPointer: d }, { U: true });
    }, i: function(a, b) {
      b = P(b);
      var c = b === "std::string";
      U(a, { name: b, fromWireType: function(d) {
        var e = G[d >> 2];
        if (c)
          for (var g = d + 4, k = 0; k <= e; ++k) {
            var h = d + 4 + k;
            if (k == e || z[h] == 0) {
              g = g ? ha(z, g, h - g) : "";
              if (l === void 0)
                var l = g;
              else
                l += String.fromCharCode(0), l += g;
              g = h + 1;
            }
          }
        else {
          l = Array(e);
          for (k = 0; k < e; ++k)
            l[k] = String.fromCharCode(z[d + 4 + k]);
          l = l.join("");
        }
        W(d);
        return l;
      }, toWireType: function(d, e) {
        e instanceof ArrayBuffer && (e = new Uint8Array(e));
        var g = typeof e === "string";
        g || e instanceof Uint8Array || e instanceof Uint8ClampedArray || e instanceof Int8Array || T("Cannot pass non-string to std::string");
        var k = (c && g ? function() {
          for (var n = 0, p = 0; p < e.length; ++p) {
            var q = e.charCodeAt(p);
            55296 <= q && 57343 >= q && (q = 65536 + ((q & 1023) << 10) | e.charCodeAt(++p) & 1023);
            127 >= q ? ++n : n = 2047 >= q ? n + 2 : 65535 >= q ? n + 3 : n + 4;
          }
          return n;
        } : function() {
          return e.length;
        })(), h = Y(4 + k + 1);
        G[h >> 2] = k;
        if (c && g)
          ia(e, h + 4, k + 1);
        else if (g)
          for (g = 0; g < k; ++g) {
            var l = e.charCodeAt(g);
            255 < l && (W(h), T("String has UTF-16 code units that do not fit in 8 bits"));
            z[h + 4 + g] = l;
          }
        else
          for (g = 0; g < k; ++g)
            z[h + 4 + g] = e[g];
        d !== null && d.push(W, h);
        return h;
      }, argPackAdvance: 8, readValueFromPointer: Sa, M: function(d) {
        W(d);
      } });
    }, d: function(a, b, c) {
      c = P(c);
      if (b === 2) {
        var d = ka;
        var e = la;
        var g = ma;
        var k = function() {
          return A;
        };
        var h = 1;
      } else
        b === 4 && (d = na, e = oa, g = pa, k = function() {
          return G;
        }, h = 2);
      U(a, { name: c, fromWireType: function(l) {
        for (var n = G[l >> 2], p = k(), q, x = l + 4, B = 0; B <= n; ++B) {
          var m = l + 4 + B * b;
          if (B == n || p[m >> h] == 0)
            x = d(x, m - x), q === void 0 ? q = x : (q += String.fromCharCode(0), q += x), x = m + b;
        }
        W(l);
        return q;
      }, toWireType: function(l, n) {
        typeof n !== "string" && T("Cannot pass non-string to C++ string type " + c);
        var p = g(n), q = Y(4 + p + b);
        G[q >> 2] = p >> h;
        e(n, q + 4, p + b);
        l !== null && l.push(W, q);
        return q;
      }, argPackAdvance: 8, readValueFromPointer: Sa, M: function(l) {
        W(l);
      } });
    }, A: function(a, b) {
      b = P(b);
      U(a, {
        aa: true,
        name: b,
        argPackAdvance: 0,
        fromWireType: function() {
        },
        toWireType: function() {
        }
      });
    }, n: Qa, x: function(a) {
      4 < a && (V[a].P += 1);
    }, C: function(a, b) {
      var c = R[a];
      c === void 0 && T("_emval_take_value has unknown type " + cb(a));
      a = c.readValueFromPointer(b);
      return Ra(a);
    }, t: function() {
      w();
    }, r: function(a, b, c) {
      z.copyWithin(a, b, b + c);
    }, s: function(a) {
      a >>>= 0;
      var b = z.length;
      if (2147483648 < a)
        return false;
      for (var c = 1; 4 >= c; c *= 2) {
        var d = b * (1 + 0.2 / c);
        d = Math.min(d, a + 100663296);
        d = Math.max(16777216, a, d);
        0 < d % 65536 && (d += 65536 - d % 65536);
        a: {
          try {
            y.grow(Math.min(2147483648, d) - E.byteLength + 65535 >>> 16);
            sa(y.buffer);
            var e = 1;
            break a;
          } catch (g) {
          }
          e = void 0;
        }
        if (e)
          return true;
      }
      return false;
    }, u: function(a, b) {
      var c = 0;
      hb().forEach(function(d, e) {
        var g = b + c;
        e = D[a + 4 * e >> 2] = g;
        for (g = 0; g < d.length; ++g)
          F[e++ >> 0] = d.charCodeAt(g);
        F[e >> 0] = 0;
        c += d.length + 1;
      });
      return 0;
    }, v: function(a, b) {
      var c = hb();
      D[a >> 2] = c.length;
      var d = 0;
      c.forEach(function(e) {
        d += e.length + 1;
      });
      D[b >> 2] = d;
      return 0;
    }, w: function() {
      return 0;
    }, q: function() {
    }, g: function(a, b, c, d) {
      for (var e = 0, g = 0; g < c; g++) {
        for (var k = D[b + 8 * g >> 2], h = D[b + (8 * g + 4) >> 2], l = 0; l < h; l++) {
          var n = z[k + l], p = jb[a];
          n === 0 || n === 10 ? ((a === 1 ? da : u)(ha(p, 0)), p.length = 0) : p.push(n);
        }
        e += h;
      }
      D[d >> 2] = e;
      return 0;
    }, a: y, l: function() {
      return 0;
    }, k: function() {
      return 0;
    }, j: function() {
    }, B: function() {
      return 6;
    }, m: function() {
    }, f: function() {
    } };
    (function() {
      function a(e) {
        f.asm = e.exports;
        I = f.asm.D;
        J--;
        f.monitorRunDependencies && f.monitorRunDependencies(J);
        J == 0 && (K && (e = K, K = null, e()));
      }
      function b(e) {
        a(e.instance);
      }
      function c(e) {
        return Promise.resolve().then(Da).then(function(g) {
          return WebAssembly.instantiate(g, d);
        }).then(e, function(g) {
          u("failed to asynchronously prepare wasm: " + g);
          w(g);
        });
      }
      var d = { a: mb };
      J++;
      f.monitorRunDependencies && f.monitorRunDependencies(J);
      if (f.instantiateWasm)
        try {
          return f.instantiateWasm(d, a);
        } catch (e) {
          return u("Module.instantiateWasm callback failed with error: " + e), false;
        }
      (function() {
        return v || typeof WebAssembly.instantiateStreaming !== "function" || Ba() || Aa("file://") || typeof fetch !== "function" ? c(b) : fetch(L, { credentials: "same-origin" }).then(function(e) {
          return WebAssembly.instantiateStreaming(e, d).then(b, function(g) {
            u("wasm streaming compile failed: " + g);
            u("falling back to ArrayBuffer instantiation");
            return c(b);
          });
        });
      })().catch(ba);
      return {};
    })();
    var lb = f.___wasm_call_ctors = function() {
      return (lb = f.___wasm_call_ctors = f.asm.E).apply(null, arguments);
    }, Y = f._malloc = function() {
      return (Y = f._malloc = f.asm.F).apply(null, arguments);
    }, W = f._free = function() {
      return (W = f._free = f.asm.G).apply(null, arguments);
    }, db = f.___getTypeName = function() {
      return (db = f.___getTypeName = f.asm.H).apply(null, arguments);
    };
    f.___embind_register_native_and_builtin_types = function() {
      return (f.___embind_register_native_and_builtin_types = f.asm.I).apply(null, arguments);
    };
    f.dynCall_jiiiii = function() {
      return (f.dynCall_jiiiii = f.asm.J).apply(null, arguments);
    };
    f.dynCall_jiji = function() {
      return (f.dynCall_jiji = f.asm.K).apply(null, arguments);
    };
    var Z;
    K = function nb() {
      Z || ob();
      Z || (K = nb);
    };
    function ob() {
      function a() {
        if (!Z && (Z = true, f.calledRun = true, !ea)) {
          N(va);
          N(wa);
          aa(f);
          if (f.onRuntimeInitialized)
            f.onRuntimeInitialized();
          if (f.postRun)
            for (typeof f.postRun == "function" && (f.postRun = [f.postRun]); f.postRun.length; ) {
              var b = f.postRun.shift();
              xa.unshift(b);
            }
          N(xa);
        }
      }
      if (!(0 < J)) {
        if (f.preRun)
          for (typeof f.preRun == "function" && (f.preRun = [f.preRun]); f.preRun.length; )
            ya();
        N(ua);
        0 < J || (f.setStatus ? (f.setStatus("Running..."), setTimeout(function() {
          setTimeout(function() {
            f.setStatus("");
          }, 1);
          a();
        }, 1)) : a());
      }
    }
    f.run = ob;
    if (f.preInit)
      for (typeof f.preInit == "function" && (f.preInit = [f.preInit]); 0 < f.preInit.length; )
        f.preInit.pop()();
    ob();
    return blosc_codec2.ready;
  };
}();

var __isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
var __toBinary = __isNode
  ? base64 => new Uint8Array(Buffer.from(base64, 'base64'))
  : /* @__PURE__ */ (() => {
    var table = new Uint8Array(128);
    for (var i = 0; i < 64; i++) table[i < 26 ? i + 65 : i < 52 ? i + 71 : i < 62 ? i - 4 : i * 4 - 205] = i;
    return base64 => {
      var n = base64.length, bytes = new Uint8Array((n - (base64[n - 1] == '=') - (base64[n - 2] == '=')) * 3 / 4 | 0);
      for (var i = 0, j = 0; i < n;) {
        var c0 = table[base64.charCodeAt(i++)], c1 = table[base64.charCodeAt(i++)];
        var c2 = table[base64.charCodeAt(i++)], c3 = table[base64.charCodeAt(i++)];
        bytes[j++] = (c0 << 2) | (c1 >> 4);
        bytes[j++] = (c1 << 4) | (c2 >> 2);
        bytes[j++] = (c2 << 6) | c3;
      }
      return bytes
    }
  })();
var wasmBinary = __toBinary("AGFzbQEAAAABwAImYAF/AX9gA39/fwF/YAV/f39/fwF/YAJ/fwF/YAJ/fwBgAX8AYAN/f38AYAR/f39/AX9gBH9/f38AYAAAYAZ/f39/f38Bf2AFf39/f38AYAZ/f39/f38AYAd/f39/f39/AX9gBH9/f38BfmAFf39/f38BfmAIf39/f39/f38Bf2AJf39/f39/f39/AX9gAn5/AX9gC39/f39/f39/f39/AX9gA39+fwF+YAN/f34AYAN/f34Bf2ADfn9/AX9gAn5+AX5gCH9/f39/f39/AGAJf39/f39/f39/AGAFf35/f38AYAABf2ANf39/f39/f39/f39/fwF/YA9/f39/f39/f39/f39/f38Bf2AFf39/fn8Bf2AGf3x/f39/AX9gAX8BfmACf38BfmAHf35/f39/fwF+YAF+AX5gBH5/f34BfgK0AR0BYQFiAAYBYQFjAAsBYQFkAAYBYQFlAAwBYQFmAAUBYQFnAAcBYQFoAAYBYQFpAAQBYQFqAAMBYQFrAAABYQFsAAABYQFtAAMBYQFuAAUBYQFvAAYBYQFwAAABYQFxAAIBYQFyAAEBYQFzAAABYQF0AAkBYQF1AAMBYQF2AAMBYQF3AAABYQF4AAUBYQF5AAQBYQF6AAsBYQFBAAQBYQFCAAcBYQFDAAMBYQFhAgGAAoCAAgOtBKsEBAEBAwIACAAAAAQHAQEBAAIBAAQDAQMBBAEFAwUFAAYAAwAIAgIDAQgBAwYBCwEBAAQYBAEEBwoGAwMLBwgBBggDCwUDAwMGCAEGBAYABwIGAAABAAIEBAYEBQMDAAsABgwDAAANBgIYAwkAAQwGBggAAgAAAAUQHQAEAQMbBwcHBwMDBh4TBAgBAgECCgcGCgYEAAQAARARAwAIAAYDBgAFBQUFBQUJCwUGAQAFBQICAgcHAwQEAAcSARIXJQQGAwMDAAUEAQABBQUDAAMGCgAFBQMBHwUDAwUFAREDBwoEAAUBAwcKCiEGBQEABgYGBQUIAxMNAAADAAkBBwcHBwcHBwcAAQgGBwMRAgICAgYCCAoCAgcCCAAFBAUFAAMAAAIKBBQACQwMCwMLCAgICwwAAQEFAAUABQkDAAMSEhcGAQAUAAAJCQkJBgAJCQkJCQkJCQkJCQkJDQ0ABgcBAQcHAgEBAgEEAwoABAcFBRwKCgoFAgoCAgMaGQUEAgICAgkFCwICAQoQAggMIiMCBgYBDAICAgICAgICAgMCAg0MAgoCAgIECgICAgQTAQEHAQcBCAUGCgUFBAYkBwUAAAgWFgYRAA0CAgsDEAUBAgYHCwIBAgIABRUVAwUABgIBCQEGAgIHBwcFAAoEAgIHAQAAAAAABAMGCAgIAAAFBgQAAAEDAwEDBQUABAEDAQQABAMNDQQECgoFAg4PDg8ODg4ICAgBCAEBAQEHBAUBcAFWVgYJAX8BQaD9wQILByYIAUQBAAFFAJYCAUYATAFHADgBSADhAgFJAMMBAUoAvgIBSwC9AgmlAQEAQQELVX9f5wK6ArYCf1+rAqECuAPVA6MDrgOPA50DjQG0Ap8CngKdApwCmwK3BLkEvgTBBKcEpgSiBKAEnwTBA8YDtwO5A7oDvQOlA6EDoAO/A8QDsgOxA7ADrwOaA5kDwAPFA7MDtAO1A7YDnAObA9cC3QLfAn9f0wLSAtEC0AJ/X/UB9QHOAswCywLKAl/PAl/DAsUCyQJfxALHAsgCwQLAAgqyrRGrBBYAIAAgASkAADcAACAAIAEpAAg3AAgLrgEBA38CQCACQX1qIgQgAE0EQCAAIQMMAQsgASgAACAAKAAAcyIDRQRAIAAhAwNAIAFBBGohASADQQRqIgMgBE8NAiABKAAAIAMoAABzIgVFDQALIAUQJSADaiAAaw8LIAMQJQ8LAkAgAyACQX9qTw0AIAEvAAAgAy8AAEcNACABQQJqIQEgA0ECaiEDCyADIAJJBH8gA0EBaiADIAEtAAAgAy0AAEYbBSADCyAAawtoAAJAAkACQAJAAkAgAkF7ag4EAQIDBAALIAAgARDeAQ8LIAAgARDdAQ8LIAAgARDcAQ8LIAApAABCgMaV/cub741PfkHAACABa62Ipw8LIAApAABC48iVvcub741PfkHAACABa62IpwsUACAAKAAAIgBBCHQgACABQQNGGws4AQF/IAMgASAAIAEgACADIAFraiIFIAIgBSACSRsQHSIFakYEfyAAIAVqIAQgAhAdIAVqBSAFCwsIACAAQYh/SwuTAQECfyABIANNBEAgACABEBwgAEEQaiABQRBqEBwgACADIAFrIgRqIQUgBEEhTgRAIABBIGohAANAIAAgAUEgaiIEEBwgAEEQaiABQTBqEBwgBCEBIABBIGoiACAFSQ0ACwsgAyEBIAUhAAsgASACSQRAA0AgACABLQAAOgAAIABBAWohACABQQFqIgEgAkcNAAsLC5gBAQR/QQMhAQJAIAAoAgQiAkEgTQRAIAACfyAAKAIIIgEgACgCEE8EQCAAIAEgAkEDdmsiAzYCCEEAIQEgAkEHcQwBCyABIAAoAgwiA0YNAiAAIAEgASADayACQQN2IgQgASAEayADSSIBGyIEayIDNgIIIAIgBEEDdGsLNgIEIAAgAygAADYCAAsgAQ8LQQFBAiACQSBJGwsIACAAZ0EfcwsIACAAaEEDdgsPACAAIAAoAgQgAWo2AgQLHAAgACACQQEgA3QiA2sgACACIABrIANLGyABGwvzAgICfwF+AkAgAkUNACAAIAJqIgNBf2ogAToAACAAIAE6AAAgAkEDSQ0AIANBfmogAToAACAAIAE6AAEgA0F9aiABOgAAIAAgAToAAiACQQdJDQAgA0F8aiABOgAAIAAgAToAAyACQQlJDQAgAEEAIABrQQNxIgRqIgMgAUH/AXFBgYKECGwiATYCACADIAIgBGtBfHEiBGoiAkF8aiABNgIAIARBCUkNACADIAE2AgggAyABNgIEIAJBeGogATYCACACQXRqIAE2AgAgBEEZSQ0AIAMgATYCGCADIAE2AhQgAyABNgIQIAMgATYCDCACQXBqIAE2AgAgAkFsaiABNgIAIAJBaGogATYCACACQWRqIAE2AgAgBCADQQRxQRhyIgRrIgJBIEkNACABrSIFQiCGIAWEIQUgAyAEaiEBA0AgASAFNwMYIAEgBTcDECABIAU3AwggASAFNwMAIAFBIGohASACQWBqIgJBH0sNAAsLIAALDQAgACABdEEAIAJrdguCBAEDfyACQYAETwRAIAAgASACEBAaIAAPCyAAIAJqIQMCQCAAIAFzQQNxRQRAAkAgAkEBSARAIAAhAgwBCyAAQQNxRQRAIAAhAgwBCyAAIQIDQCACIAEtAAA6AAAgAUEBaiEBIAJBAWoiAiADTw0BIAJBA3ENAAsLAkAgA0F8cSIEQcAASQ0AIAIgBEFAaiIFSw0AA0AgAiABKAIANgIAIAIgASgCBDYCBCACIAEoAgg2AgggAiABKAIMNgIMIAIgASgCEDYCECACIAEoAhQ2AhQgAiABKAIYNgIYIAIgASgCHDYCHCACIAEoAiA2AiAgAiABKAIkNgIkIAIgASgCKDYCKCACIAEoAiw2AiwgAiABKAIwNgIwIAIgASgCNDYCNCACIAEoAjg2AjggAiABKAI8NgI8IAFBQGshASACQUBrIgIgBU0NAAsLIAIgBE8NAQNAIAIgASgCADYCACABQQRqIQEgAkEEaiICIARJDQALDAELIANBBEkEQCAAIQIMAQsgA0F8aiIEIABJBEAgACECDAELIAAhAgNAIAIgAS0AADoAACACIAEtAAE6AAEgAiABLQACOgACIAIgAS0AAzoAAyABQQRqIQEgAkEEaiICIARNDQALCyACIANJBEADQCACIAEtAAA6AAAgAUEBaiEBIAJBAWoiAiADRw0ACwsgAAsbAQF/IABBAWoiABAkIgFBCHQgAEEIdCABdmoLhQEBBn8gACgCICEGIAAoAhgiBSADIAAoAgQiCGsiB0kEQEF/IAF0QX9zIQEgACgCKCEJA0AgCSABIAVxQQJ0aiAGIAUgCGogAiAEEFpBAnRqIgooAgA2AgAgCiAFNgIAIAVBAWoiBSAHSQ0ACwsgACAHNgIYIAYgAyACIAQQWkECdGooAgALXAEBfyABKAI4QQFGBEAgAgRAIAAQKw8LIAAQLg8LIAAQgAFBAnQiA0GwpwFqKAIAQQh0IAEoAixqIQAgASgCBCADaigCACEBIAIEQCAAIAEQK2sPCyAAIAEQLmsLDAAgAEEBahAkQQh0CwkAIAAgATsAAAsWACAAQbHz3fF5bEETQRQgAUEDRht2C5sBAQV/IwBBEGsiBSQAIAUgAjYCDCACQRh2IQYgAUEEaiEHIAAhBANAIAQiAyAHTwRAIAIgA0F8aiIEKAAARg0BCwsCQCADIAFNDQAgA0F/aiIELQAAIAZHDQAgBUEMakEDciECA0AgBCIDIAFNBEAgASEDDAILIANBf2oiBC0AACACQX9qIgItAABGDQALCyAFQRBqJAAgACADawsNACABQX9zIABqQQJLC3gBA38CQAJAIAFBfWoiBCAAIgNNDQADQCACIAMoAABzIgVFBEAgA0EEaiIDIARJDQEMAgsLIAUQJSADaiEDDAELIAMgAU8NAANAIAMtAAAgAkH/AXFHDQEgAkEIdiECIANBAWoiAyABRw0ACyABIABrDwsgAyAAawsJACAAIAE2AAALFAAgAUUEQEEADwsgACABIAIQqQQLigEBA38gACgCHCIBEJkEAkAgACgCECICIAEoAhQiAyADIAJLGyICRQ0AIAAoAgwgASgCECACECoaIAAgACgCDCACajYCDCABIAEoAhAgAmo2AhAgACAAKAIUIAJqNgIUIAAgACgCECACazYCECABIAEoAhQgAmsiADYCFCAADQAgASABKAIINgIQCwsRACAAIAEpAAA3AAAgAEEIagvXAgEFfyAABEAgAEF8aiIBKAIAIgQhAyABIQIgAEF4aigCACIFQX9MBEAgASAFaiIAKAIFIgIgACgCCTYCCCAAKAIJIAI2AgQgBCAFQX9zaiEDIABBAWohAgsgASAEaiIAKAIAIgEgACABakF8aigCAEcEQCAAKAIEIgQgACgCCDYCCCAAKAIIIAQ2AgQgASADaiEDCyACIAM2AgAgA0F8cSACakF8aiADQX9zNgIAIAICfyACKAIAQXhqIgBB/wBNBEAgAEEDdkF/agwBCyAAZyEBIABBHSABa3ZBBHMgAUECdGtB7gBqIABB/x9NDQAaIABBHiABa3ZBAnMgAUEBdGtBxwBqIgBBPyAAQT9JGwsiA0EEdCIAQYDtAWo2AgQgAiAAQYjtAWoiACgCADYCCCAAIAI2AgAgAigCCCACNgIEQYj1AUGI9QEpAwBCASADrYaENwMACwtUAQJ/IAAoAgQhASAAKAIMIAAoAgAQ/AEgACAAKAIEQQdxNgIEIAAgACgCACABQXhxdjYCACAAIAAoAhAiAiAAKAIMIAFBA3ZqIgAgACACSxs2AgwLEQAgACgAAEGx893xeWxBEXYLIgADQCAAIAEpAAA3AAAgAUEIaiEBIABBCGoiACACSQ0ACwsdACAAQYABTwRAIAAQJEEkag8LIABBsKYBai0AAAsKACABIABBA3R3Cw0AIAAoAgggACgCDGoLpQEBAX8gAkEDTwRAIAAgASgCBDYCCCABKAIAIQEgACACQX5qNgIAIAAgATYCBA8LAkACfwJAAkAgAiADaiICDgQDAQEAAQsgASgCACIDQX9qDAELIAEoAgAhAyABIAJBAnRqKAIACyEEIAFBBEEIIAJBAUsbaigCACEBIAAgAzYCBCAAIAE2AgggACAENgIADwsgACABKQIANwIAIAAgASgCCDYCCAtVAQJ/IAQgARDQASEGIAMoAgAiBSAEIABrIgRJBEADQCACIAAgBWogARDQAUECdGogBTYCACAFQQFqIgUgBEkNAAsLIAMgBDYCACACIAZBAnRqKAIAC7QEARV/IwBBEGsiDiQAIAAoAiAgASAAKAJ8IAMQHkECdGoiBSgCACEDIAAoAnghBiAAKAIIIQ8gACgCDCEMIAAoAighEiAAKAKAASEIIAAoAhAhEyAFIAEgACgCBCINayIJNgIAIBIgCUF/IAZBf2p0QX9zIhRxQQN0aiEHIAlBCWohCgJ/IAMgE0kEQCAHQgA3AgBBAAwBC0EAIAkgFGsiACAAIAlLGyEVIAdBBGohBiAMIA1qIRYgDCAPaiEXQX8gCHRBf3MhEUEIIQtBACEIA0ACfyAEQQAgECAIIBAgCEkbIgAgA2ogDEkbRQRAIAAgAWogAyANaiAAaiACEB0gAGoiACADaiEFIA0MAQsgDyANIAAgAWogAyAPaiAAaiACIBcgFhAgIABqIgAgA2oiBSAMSRsLIRggBSAKIAAgCiADa0sbIAogACALSyIFGyEKIAAgCyAFGyELAkAgACABaiIZIAJGDQAgEiADIBRxQQN0aiEFAkACQCADIBhqIABqLQAAIBktAABJBEAgByADNgIAIAMgFUsNASAOQQxqIQcMAwsgBiADNgIAIAMgFUsEQCAAIQggBSEGDAILIA5BDGohBgwCCyAAIRAgBUEEaiIHIQULIBFFDQAgEUF/aiERIAUoAgAiAyATTw0BCwsgBkEANgIAIAdBADYCACALQYB9aiIAQcABIABBwAFJG0EAIAtBgANLGwshAyAOQRBqJAAgAyAKIAlrQXhqIgAgAyAASxsLHAEBfyAAKAIAIAAoAgQgARApIQIgACABECYgAgssACACRQRAIAAoAgQgASgCBEYPCyAAIAFGBEBBAQ8LIAAQkAEgARCQARBdRQukBAEDf0EBIQYCQCABRSACQQRqAn8gACgChAFBAU4EQCAAKAIAIgQoAixBAkYEQCAEIAAQmAQ2AiwLIAAgAEGYFmoQrgEgACAAQaQWahCuASAAEJcEQQFqIQYgACgCqC1BCmpBA3YiBSAAKAKsLUEKakEDdiIEIAQgBUsbDAELIAJBBWoiBAsiBUtyRQRAIAAgASACIAMQjgIMAQsgACgCvC0hAQJAIAQgBUcEQCAAKAKIAUEERw0BCyAAIAAvAbgtIANBAmpB//8DcSICIAF0ciIEOwG4LSAAAn8gAUEOTgRAIAAgACgCFCIBQQFqNgIUIAEgACgCCGogBDoAACAAIAAoAhQiAUEBajYCFCABIAAoAghqIABBuS1qLQAAOgAAIAAgAkEQIAAoArwtIgFrdjsBuC0gAUFzagwBCyABQQNqCzYCvC0gAEGA2wBBgNkAEIsCDAELIAAgAC8BuC0gA0EEakH//wNxIgIgAXRyIgQ7AbgtIAACfyABQQ5OBEAgACAAKAIUIgFBAWo2AhQgASAAKAIIaiAEOgAAIAAgACgCFCIBQQFqNgIUIAEgACgCCGogAEG5LWotAAA6AAAgACACQRAgACgCvC0iAWt2OwG4LSABQXNqDAELIAFBA2oLNgK8LSAAIABBnBZqKAIAQQFqIABBqBZqKAIAQQFqIAYQlgQgACAAQZQBaiAAQYgTahCLAgsgABCNAiADBEAgABCMAgsL9QEBAX8gAkUEQCAAQgA3AgAgAEEANgIQIABCADcCCEG4fw8LIAAgATYCDCAAIAFBBGo2AhAgAkEETwRAIAAgASACaiIBQXxqIgM2AgggACADKAAANgIAIAFBf2otAAAiAUUEQCAAQQA2AgRBfw8LIABBCCABECRrNgIEIAIPCyAAIAE2AgggACABLQAAIgM2AgACQAJAAkAgAkF+ag4CAQACCyAAIAEtAAJBEHQgA3IiAzYCAAsgACABLQABQQh0IANqNgIACyABIAJqQX9qLQAAIgFFBEAgAEEANgIEQWwPCyAAQSggARAkIAJBA3RqazYCBCACCy0BAX8gAUECdEGwwwFqKAIAIAAoAgBBICABIAAoAgRqa3ZxIQIgACABECYgAgsxAQF/IAAgACgCBCIDIAJqNgIEIAAgACgCACACQQJ0QbDDAWooAgAgAXEgA3RyNgIACyEAIAJBAkYEQCABIABBAnRqKAIADwsgASAAQQF0ai8BAAtIAAJAAkACQAJAIANBf2oOAwABAgMLIAIgAUECdGogADYCAA8LIAIgAUECdGogACAEazYCAA8LIAIgAUEBdGogACAEazsBAAsL6QIBAX8CQCAAIAFGDQAgASAAayACa0EAIAJBAXRrTQRAIAAgASACECoPCyAAIAFzQQNxIQMCQAJAIAAgAUkEQCADBEAgACEDDAMLIABBA3FFBEAgACEDDAILIAAhAwNAIAJFDQQgAyABLQAAOgAAIAFBAWohASACQX9qIQIgA0EBaiIDQQNxDQALDAELAkAgAw0AIAAgAmpBA3EEQANAIAJFDQUgACACQX9qIgJqIgMgASACai0AADoAACADQQNxDQALCyACQQNNDQADQCAAIAJBfGoiAmogASACaigCADYCACACQQNLDQALCyACRQ0CA0AgACACQX9qIgJqIAEgAmotAAA6AAAgAg0ACwwCCyACQQNNDQADQCADIAEoAgA2AgAgAUEEaiEBIANBBGohAyACQXxqIgJBA0sNAAsLIAJFDQADQCADIAEtAAA6AAAgA0EBaiEDIAFBAWohASACQX9qIgINAAsLIAALDQAgASACRiAAQSBGcQsJAEEIIAAQtQELCAAgACABEDQLIQAgAULP1tO+0ser2UJ+IAB8Qh+JQoeVr6+Ytt6bnn9+CyYBAX8jAEEQayICJAAgAiABNgIMQdjpASAAIAEQuQEgAkEQaiQAC2AAAkACQAJAAkAgAkF4ag4ZAgMDAwMDAwMBAwMDAwMDAwMDAwMDAwMDAAMLIAAgARCUAg8LIAAgARBWDwsgACABEDcPCyACQQdNBEAgACABIAIQwwQPCyAAIAEgAhDCBAt/AQF/IABBQGsoAgAQcARAIAAoAhghAiAAAn8gAQRAIAIQKwwBCyACEC4LNgIoCyAAKAIcIQIgAAJ/IAEEQCACECshASAAKAIgECshAiAAKAIkECsMAQsgAhAuIQEgACgCIBAuIQIgACgCJBAuCzYCNCAAIAI2AjAgACABNgIsC4MBAQN/IAFFBEBBAA8LIAJBQGsoAgAQcEUEQCABQQt0DwsgAigCOEEBRgRAIAFBgAxsDwsgAigCKCABbCEEIAIoAgAhBkEAIQIDQCAGIAAgAmotAABBAnRqKAIAIQUgBAJ/IAMEQCAFECsMAQsgBRAuC2shBCACQQFqIgIgAUcNAAsgBAuwBgEXfyMAQRBrIhQkAEEBIAAoAoABdCEKIAAoAighDgJAIAAoAiAgASAAKAJ8IAQQWkECdGoiDCgCACIJQQAgASAAKAIEIg9rIghBfyAAKAJ4QX9qdEF/cyIQayIGIAYgCEsbIhUgACgCECAAKAIUIAggACgCdBAnIhYgFSAWSxsiDU0NACAKIQcCQANAIA4gCSIGIBBxQQN0aiIJKAIEIhdBAUcgB0ECSXJFBEAgCSALNgIEIAdBf2ohByAGIQsgCSgCACIJIA1LDQEMAgsLIBdBAUYEQCAJQgA3AgALIAsiBkUNAQsgDkEEaiEJA0AgCSAGIBBxQQN0aigCACELIAAgBiACIAcgDSAFELwDIAdBAWohByALIgYNAAsLIAAoAgghGCAAKAIMIREgDCgCACEHIAwgCDYCACAKQX9qIQogCEEJaiESIA4gCCAQcUEDdGoiE0EEaiEMAkAgByAWTQRAIAohBkEAIQgMAQsgDyARaiEZIBEgGGohGiAIQQJqIRsgCEEBaiEcQQAhCEEAIQtBACENA0ACfyAFQQFGQQAgDSALIA0gC0kbIgYgB2ogEUkbRQRAIAEgBmogByAPaiAGaiACEB0gBmohBiAPDAELIBggDyABIAZqIAcgGGogBmogAiAaIBkQICAGaiIGIAdqIBFJGwshFwJAIAYgCE0NACAGIAhrQQJ0IBwgB2sQJCADKAIAQQFqECRrSgRAIAMgGyAHazYCACAGIQgLIAYgB2ogEiAGIBIgB2tLGyESIAEgBmogAkcNAEEAIAogBUECRhshBgwCCyAOIAcgEHFBA3RqIQkCQAJAIAcgF2ogBmotAAAgASAGai0AAEkEQCATIAc2AgAgByAVSw0BIBRBDGohEyAKIQYMBAsgDCAHNgIAIAcgFUsEQCAGIQsgCSEMDAILIBRBDGohDCAKIQYMAwsgBiENIAlBBGoiEyEJCyAKQX9qIgYgCk8NASAGIQogCSgCACIHIBZLDQALCyAMQQA2AgAgE0EANgIAIAZFIAVBAkdyRQRAIAAgASACIAMgCCAGIAQQuwMhCAsgACASQXhqNgIYIBRBEGokACAIC44BAQh/IAAoAhgiAyABIAAoAgQiBWsiAUkEQEF/IAAoAnhBf2p0QX9zIQYgACgCfCEHIAAoAighCCAAKAIgIQkDQCAJIAMgBWogByACEFpBAnRqIgQoAgAhCiAEIAM2AgAgCCADIAZxQQN0aiIEQQE2AgQgBCAKNgIAIANBAWoiAyABSQ0ACwsgACABNgIYCw4AIAAgARDjAUECEOIBC6cBACAAIAEtAAA6AAAgACABLQABOgABIAAgAS0AAjoAAiAAIAEtAAM6AAMgACABLQAEOgAEIAAgAS0ABToABSAAIAEtAAY6AAYgACABLQAHOgAHIAAgAS0ACDoACCAAIAEtAAk6AAkgACABLQAKOgAKIAAgAS0ACzoACyAAIAEtAAw6AAwgACABLQANOgANIAAgAS0ADjoADiAAIAEtAA86AA8gAEEQagvTAQEDfyAAQUBrKAIAEHAEQCABBEAgACgCACEGA0AgBiACIAVqLQAAQQJ0aiIHIAcoAgBBAmo2AgAgBUEBaiIFIAFHDQALCyAAIAAoAhggAUEBdGo2AhgLIAAoAgQgARCAAUECdGoiASABKAIAQQFqNgIAIAAgACgCHEEBajYCHCAAKAIMIANBAWoQJEECdGoiASABKAIAQQFqNgIAIAAgACgCJEEBajYCJCAAKAIIIARBfWoQPEECdGoiASABKAIAQQFqNgIAIAAgACgCIEEBajYCIAsWACAAIAEgAiADEFIgASACIAMQogNqC7cIAQR/IwBBEGsiBiQAIABBQGsoAgAQcCEFIABBADYCOAJAIAAoAhxFBEAgAkGACE0EQCAAQQE2AjgLIAAoAjwiBCgCgAhBAkYEQEEAIQIgAEEANgI4IAUEQCAAQQA2AhggACgCACIFQQFBCyAEQQAQ+QEiAWt0QQEgARsiATYCACAAIAAoAhggAWo2AhhBASEBA0AgBSABQQJ0akEBQQsgBCABEPkBIgdrdEEBIAcbIgc2AgAgACAAKAIYIAdqNgIYIAFBAWoiAUGAAkcNAAsLIAYgBEG0GWoQcyAAQQA2AhwgACgCBCEBIAYoAgghBQNAIAEgAkECdGpBAUEKIAUgAhCYASIEa3RBASAEGyIENgIAIAAgACgCHCAEajYCHCACQQFqIgJBJEcNAAsgBiAAKAI8QYgOahBzQQAhAiAAQQA2AiAgACgCCCEBIAYoAgghBQNAIAEgAkECdGpBAUEKIAUgAhCYASIEa3RBASAEGyIENgIAIAAgACgCICAEajYCICACQQFqIgJBNUcNAAsgBiAAKAI8QYQIahBzQQAhAiAAQQA2AiQgACgCDCEBIAYoAgghBQNAIAEgAkECdGpBAUEKIAUgAhCYASIEa3RBASAEGyIENgIAIAAgACgCJCAEajYCJCACQQFqIgJBIEcNAAsMAgsgBQRAIAZB/wE2AgAgACgCACAGIAEgAhCqARogACAAKAIAQf8BQQEQbzYCGAsgACgCBCIBQoGAgIAQNwKIASABQoGAgIAQNwKAASABQoGAgIAQNwJ4IAFCgYCAgBA3AnAgAUKBgICAEDcCaCABQoGAgIAQNwJgIAFCgYCAgBA3AlggAUKBgICAEDcCUCABQoGAgIAQNwJIIAFCgYCAgBA3AkAgAUKBgICAEDcCOCABQoGAgIAQNwIwIAFCgYCAgBA3AiggAUKBgICAEDcCICABQoGAgIAQNwIYIAFCgYCAgBA3AhAgAUKBgICAEDcCCCABQoGAgIAQNwIAIABBJDYCHCAAKAIIIQFBACECA0AgASACQQJ0akEBNgIAIAJBAWoiAkE1Rw0ACyAAQTU2AiAgACgCDCIBQoGAgIAQNwJ4IAFCgYCAgBA3AnAgAUKBgICAEDcCaCABQoGAgIAQNwJgIAFCgYCAgBA3AlggAUKBgICAEDcCUCABQoGAgIAQNwJIIAFCgYCAgBA3AkAgAUKBgICAEDcCOCABQoGAgIAQNwIwIAFCgYCAgBA3AiggAUKBgICAEDcCICABQoGAgIAQNwIYIAFCgYCAgBA3AhAgAUKBgICAEDcCCCABQoGAgIAQNwIAIABBIDYCJAwBCyAFBEAgACAAKAIAQf8BQQEQbzYCGAsgACAAKAIEQSNBABBvNgIcIAAgACgCCEE0QQAQbzYCICAAIAAoAgxBH0EAEG82AiQLIAAgAxBRIAZBEGokAAssAAJAAkACQCACQXtqDgIBAgALIAAgARDeAQ8LIAAgARDdAQ8LIAAgARDcAQshACAAIAIgACgCBCICajYCBCAAIAAoAgAgASACdHI2AgALMAACQAJAAkAgA0F+ag4CAAECCyACIAFBAnRqIAA2AgAPCyACIAFBAXRqIAA7AQALC0oBAn8CQCAALQAAIgJFIAIgAS0AACIDR3INAANAIAEtAAEhAyAALQABIgJFDQEgAUEBaiEBIABBAWohACACIANGDQALCyACIANrC20BAX8jAEGAAmsiBSQAIARBgMAEcSACIANMckUEQCAFIAFB/wFxIAIgA2siAkGAAiACQYACSSIBGxAoGiABRQRAA0AgACAFQYACEGYgAkGAfmoiAkH/AUsNAAsLIAAgBSACEGYLIAVBgAJqJAALBgAgABA4CwsAIAAgAUEBEOIBCy8BAn8gACgCBCAAKAIAQQJ0aiICLQACIQMgACACLwEAIAEgAi0AAxBGajYCACADCy8BAn8gACgCBCAAKAIAQQJ0aiICLQACIQMgACACLwEAIAEgAi0AAxBCajYCACADC0YAIAAgARBzIAAgACgCBCAAKAIIIAJBA3RqIgAoAgQiAUGAgAJqIgJBgIB8cSABayACQRB2dSAAKAIAakEBdGovAQA2AgALGgAgAARAIAIEQCADIAAgAhEEAA8LIAAQOAsL0AUBA38gAEH//wNxIQMgAEEQdiEEQQEhACACQQFGBEAgAyABLQAAaiIAQY+AfGogACAAQfD/A0sbIgAgBGoiAUEQdCICQYCAPGogAiABQfD/A0sbIAByDwsgAQR/IAJBEE8EQAJAAkACQCACQa8rSwRAA0BB2wIhBSABIQADQCADIAAtAABqIgMgBGogAyAALQABaiIDaiADIAAtAAJqIgNqIAMgAC0AA2oiA2ogAyAALQAEaiIDaiADIAAtAAVqIgNqIAMgAC0ABmoiA2ogAyAALQAHaiIDaiADIAAtAAhqIgNqIAMgAC0ACWoiA2ogAyAALQAKaiIDaiADIAAtAAtqIgNqIAMgAC0ADGoiA2ogAyAALQANaiIDaiADIAAtAA5qIgNqIAMgAC0AD2oiA2ohBCAAQRBqIQAgBUF/aiIFDQALIARB8f8DcCEEIANB8f8DcCEDIAFBsCtqIQEgAkHQVGoiAkGvK0sNAAsgAkUNAyACQRBJDQELA0AgAyABLQAAaiIAIARqIAAgAS0AAWoiAGogACABLQACaiIAaiAAIAEtAANqIgBqIAAgAS0ABGoiAGogACABLQAFaiIAaiAAIAEtAAZqIgBqIAAgAS0AB2oiAGogACABLQAIaiIAaiAAIAEtAAlqIgBqIAAgAS0ACmoiAGogACABLQALaiIAaiAAIAEtAAxqIgBqIAAgAS0ADWoiAGogACABLQAOaiIAaiAAIAEtAA9qIgNqIQQgAUEQaiEBIAJBcGoiAkEPSw0ACyACRQ0BCwNAIAMgAS0AAGoiAyAEaiEEIAFBAWohASACQX9qIgINAAsLIARB8f8DcCEEIANB8f8DcCEDCyAEQRB0IANyDwsgAgRAA0AgAyABLQAAaiIDIARqIQQgAUEBaiEBIAJBf2oiAg0ACwsgBEHx/wNwQRB0IANBj4B8aiADIANB8P8DSxtyBSAACwsYACAALQAAQSBxRQRAIAEgAiAAEKUBGgsLDAAgACABKQAANwAACx8AIAAgASACKAIEEEY2AgAgARAjGiAAIAJBCGo2AgQLCQBBAUEFIAAbC88MAQ1/AkACQAJAAkACQCAAKAKEAUF7ag4DAQICAAsgACgCBCELIAAoAnQhByAAKAIQIQUgACgCFCEKIAAoAighCCAAKAIMIQ9BASAAKAKAAXQhDEEDIQYCQCAAIAAoAngiDSAAKAJ8IAFBBBAsIgQgBSABIAtrIglBASAHdCIHayAFIAkgBWsgB0sbIAobIgdNDQBBACAJQQEgDXQiBmsiBSAFIAlLGyEKIAZBf2ohDSAJQQJqIQ5BAyEGA0ACQCAEIAtqIgUgBmotAAAgASAGai0AAEcNACABIAUgAhAdIgUgBk0NACADIA4gBGs2AgAgBSIGIAFqIAJHDQAMAgsgBCAKTQ0BIAxBf2oiDEUNASAIIAQgDXFBAnRqKAIAIgQgB0sNAAsLIAAoAnAiACgCBCEFIAAoAgAhByAAKAJ4IQggACgCDCEKIAAoAighDSAAKAIgIQQgASAAKAJ8QQQQWiEAIAxFDQMgBCAAQQJ0aigCACIEIApNDQMgCyAPaiELQQAgByAFayIAQQEgCHQiCGsiDiAOIABLGyEOIAhBf2ohCCABQQRqIRAgCSAPayAAakECaiEJA0ACQCAEIAVqIgAoAAAgASgAAEcNACAQIABBBGogAiAHIAsQIEEEaiIAIAZNDQAgAyAJIARrNgIAIAAhBiAAIAFqIAJGDQQLIAQgDk0NBCAMQX9qIgxFDQQgBiEAIA0gBCAIcUECdGooAgAiBCAKSw0ACwwCCyAAKAIEIQsgACgCdCEHIAAoAhAhBSAAKAIUIQogACgCKCEIIAAoAgwhD0EBIAAoAoABdCEMQQMhBgJAIAAgACgCeCINIAAoAnwgAUEFECwiBCAFIAEgC2siCUEBIAd0IgdrIAUgCSAFayAHSxsgChsiB00NAEEAIAlBASANdCIGayIFIAUgCUsbIQogBkF/aiENIAlBAmohDkEDIQYDQAJAIAQgC2oiBSAGai0AACABIAZqLQAARw0AIAEgBSACEB0iBSAGTQ0AIAMgDiAEazYCACAFIgYgAWogAkcNAAwCCyAEIApNDQEgDEF/aiIMRQ0BIAggBCANcUECdGooAgAiBCAHSw0ACwsgACgCcCIAKAIEIQUgACgCACEHIAAoAnghCCAAKAIMIQogACgCKCENIAAoAiAhBCABIAAoAnxBBRBaIQAgDEUNAiAEIABBAnRqKAIAIgQgCk0NAiALIA9qIQtBACAHIAVrIgBBASAIdCIIayIOIA4gAEsbIQ4gCEF/aiEIIAFBBGohECAJIA9rIABqQQJqIQkDQAJAIAQgBWoiACgAACABKAAARw0AIBAgAEEEaiACIAcgCxAgQQRqIgAgBk0NACADIAkgBGs2AgAgACEGIAAgAWogAkYNAwsgBCAOTQ0DIAxBf2oiDEUNAyAGIQAgDSAEIAhxQQJ0aigCACIEIApLDQALDAELIAAoAgQhCyAAKAJ0IQcgACgCECEFIAAoAhQhCiAAKAIoIQggACgCDCEPQQEgACgCgAF0IQxBAyEGAkAgACAAKAJ4Ig0gACgCfCABQQYQLCIEIAUgASALayIJQQEgB3QiB2sgBSAJIAVrIAdLGyAKGyIHTQ0AQQAgCUEBIA10IgZrIgUgBSAJSxshCiAGQX9qIQ0gCUECaiEOQQMhBgNAAkAgBCALaiIFIAZqLQAAIAEgBmotAABHDQAgASAFIAIQHSIFIAZNDQAgAyAOIARrNgIAIAUiBiABaiACRw0ADAILIAQgCk0NASAMQX9qIgxFDQEgCCAEIA1xQQJ0aigCACIEIAdLDQALCyAAKAJwIgAoAgQhBSAAKAIAIQcgACgCeCEIIAAoAgwhCiAAKAIoIQ0gACgCICEEIAEgACgCfEEGEFohACAMRQ0BIAQgAEECdGooAgAiBCAKTQ0BIAsgD2ohC0EAIAcgBWsiAEEBIAh0IghrIg4gDiAASxshDiAIQX9qIQggAUEEaiEQIAkgD2sgAGpBAmohCQNAAkAgBCAFaiIAKAAAIAEoAABHDQAgECAAQQRqIAIgByALECBBBGoiACAGTQ0AIAMgCSAEazYCACAAIQYgACABaiACRg0CCyAEIA5NDQIgDEF/aiIMRQ0CIAYhACANIAQgCHFBAnRqKAIAIgQgCksNAAsLIAAPCyAGC9wFAQx/IwBBEGsiCiQAAn8gBEEDTQRAIApBADYCDCAKQQxqIAMgBBAqGiAAIAEgAiAKQQxqQQQQayIAQWwgABAhGyAAIAAgBEsbDAELIABBACABKAIAQQF0QQJqECghDkFUIAMoAAAiBUEPcSIAQQpLDQAaIAIgAEEFajYCACADIARqIgJBfGohCyACQXlqIQ8gAkF7aiEQQQQhAiAFQQR2IQQgAEEGaiEMQSAgAHQiCEEBciEJIAEoAgAhDSADIQZBACEAQQAhBQNAAkACQCAARQRAIAUhBwwBCyAFIQAgBEH//wNxQf//A0YEQANAIABBGGohAAJ/IAYgEEkEQCAGQQJqIgYoAAAgAnYMAQsgAkEQaiECIARBEHYLIgRB//8DcUH//wNGDQALCyAEQQNxIgdBA0YEQANAIAJBAmohAiAAQQNqIQAgBEECdiIEQQNxIgdBA0YNAAsLQVAgACAHaiIHIA1LDQMaIAJBAmohAgJAIAcgBU0EQCAFIQcMAQsgDiAFQQF0akEAIAcgBWtBAXQQKBoLIAYgD0tBACAGIAJBA3VqIgAgC0sbRQRAIAAoAAAgAkEHcSICdiEEDAILIARBAnYhBAsgBiEACwJ/IAxBf2ogBCAIQX9qcSIGIAhBAXRBf2oiBSAJayINSQ0AGiAEIAVxIgRBACANIAQgCEgbayEGIAwLIQUgDiAHQQF0aiAGQX9qIgQ7AQAgBEEBIAZrIAZBAUgbIAlqIgkgCEgEQANAIAxBf2ohDCAJIAhBAXUiCEgNAAsLIAIgBWoiAiAAIAtrQQN0aiACQQdxIAAgD0sgACACQQN1aiIAIAtLcSIFGyECIAsgACAFGyIGKAAAIQUgCUECTgRAIARFIQAgBSACdiEEIAdBAWoiBSABKAIAIg1NDQELC0FsIAlBAUcgAkEgSnINABogASAHNgIAIAYgAkEHakEDdWogA2sLIQAgCkEQaiQAIAALTgECfyABKAIIIAJBA3RqIgIoAgAhAyABKAIEIQQgACABKAIAIgAgACACKAIEakEQdiIAEEcgASAEIAMgASgCACAAdWpBAXRqLwEANgIACxsAIABBASAAGyEAAkAgABBMIgANABASAAsgAAsKACAAQVBqQQpJC0cBA38gAkEEaiEFQQAhAgNAIAAgAkECdGoiAyADKAIAIAV2QQFqIgM2AgAgAyAEaiEEIAEgAkchAyACQQFqIQIgAw0ACyAECwcAIABBAkcL9AIBAn8jAEEgayIFJAACf0EAIAFBCEkNABogBUEIaiAAIAEQ+QNBAEEAECENABogA0F8cSEGAkACQAJAAkAgA0EDcUEBaw4DAgEAAwsgBUEIaiAEIAIgBkECcmotAABBAnRqIgAvAQAgAC0AAhBbIAVBCGoQOQsgBUEIaiAEIAIgBkEBcmotAABBAnRqIgAvAQAgAC0AAhBbCyAFQQhqIAQgAiAGai0AAEECdGoiAC8BACAALQACEFsgBUEIahA5CyAGBEADQCAFQQhqIAQgAiAGaiIAQX9qLQAAQQJ0aiIBLwEAIAEtAAIQWyAFQQhqIAQgAEF+ai0AAEECdGoiAS8BACABLQACEFsgBUEIahA5IAVBCGogBCAAQX1qLQAAQQJ0aiIALwEAIAAtAAIQWyAFQQhqIAQgAiAGQXxqIgZqLQAAQQJ0aiIALwEAIAAtAAIQWyAFQQhqEDkgBg0ACwsgBUEIahD4AwshBiAFQSBqJAAgBgs/AQF/IAEhAiACAn9BpOoBKAIAQX9MBEAgACACQdjpARClAQwBCyAAIAJB2OkBEKUBCyIARgRADwsgACABbhoLPgEBfyAAIAEvAAAiAjYCDCAAIAFBBGoiATYCBCAAQQEgAnQ2AgAgACABQQEgAkF/anRBASACG0ECdGo2AggLDgAgACABIAIQRyAAEDkLPwEBfyAAIAAoAhQiAkEBajYCFCACIAAoAghqIAFBCHY6AAAgACAAKAIUIgJBAWo2AhQgAiAAKAIIaiABOgAAC44FAQp/IAAoAiwiAkH6fWohCCAAKAJ0IQUgAiEBA0AgACgCPCAFayAAKAJsIgVrIQQgBSABIAhqTwRAIAAoAjgiASABIAJqIAIQKhogACAAKAJwIAJrNgJwIAAgACgCbCACayIFNgJsIAAgACgCXCACazYCXCAAKAJEIAAoAkwiA0EBdGohAQNAIAFBfmoiAUEAIAEvAQAiByACayIGIAYgB0sbOwEAIANBf2oiAw0ACyAAKAJAIAJBAXRqIQEgAiEDA0AgAUF+aiIBQQAgAS8BACIHIAJrIgYgBiAHSxs7AQAgA0F/aiIDDQALIAIgBGohBAsCQCAAKAIAIgEoAgRFDQAgACABIAAoAnQgACgCOCAFamogBBCeBCAAKAJ0aiIFNgJ0AkAgACgCtC0iAyAFakEDSQ0AIAAgACgCOCIHIAAoAmwgA2siAWoiBC0AACIGNgJIIAAgACgCVCIJIAQtAAEgBiAAKAJYIgZ0c3EiBDYCSANAIANFDQEgACABIAdqLQACIAQgBnRzIAlxIgQ2AkggACgCQCAAKAI0IAFxQQF0aiAAKAJEIARBAXRqIgovAQA7AQAgCiABOwEAIAAgA0F/aiIDNgK0LSABQQFqIQEgAyAFakECSw0ACwsgBUGFAksNACAAKAIAKAIERQ0AIAAoAiwhAQwBCwsCQCAAKAI8IgMgACgCwC0iAk0NACACIAAoAnQgACgCbGoiAUkEQCAAKAI4IAFqQQAgAyABayICQYICIAJBggJJGyICECgaIAAgASACajYCwC0PCyABQYICaiIBIAJNDQAgACgCOCACakEAIAMgAmsiAyABIAJrIgIgAiADSxsiAhAoGiAAIAAoAsAtIAJqNgLALQsLEQAgACABKAAANgAAIABBBGoLEQAgACABLwAAOwAAIABBAmoLTAEBfyMAQRBrIgEkACABQQA2AgwCQAJ/IAFBICAAELUBIgA2AgxBAEEMIAAbRQsEQCABKAIMIgANAQsQ/ANBACEACyABQRBqJAAgAAtJAQJ/IAAoAgQiBUEIdSEGIAAoAgAiACABIAVBAXEEfyACKAIAIAZqKAIABSAGCyACaiADQQIgBUECcRsgBCAAKAIAKAIYEQsACxYAAn8gABCRAQRAIAAoAgAMAQsgAAsLsAEBAX8gAQJ/IAJBB00EQCAAKAIAIAEoAgAtAAA6AAAgACgCACABKAIALQABOgABIAAoAgAgASgCAC0AAjoAAiAAKAIAIAEoAgAtAAM6AAMgASABKAIAIAJBAnQiAkGQwwFqKAIAaiIDNgIAIAAoAgAgAygAADYABCABKAIAIAJB8MIBaigCAGsMAQsgACgCACABKAIAEGcgASgCAAtBCGo2AgAgACAAKAIAQQhqNgIAC9EDAQp/IwBB8ABrIgskACAAQQhqIQxBASAFdCEKAkAgAkF/RgRAIAAgBTYCBCAAQQE2AgAMAQtBgIAEIAVBf2p0QRB1IQ0gCkF/aiIOIQhBASEGA0ACQCABIAdBAXQiD2ovAQAiCUH//wNGBEAgDCAIQQN0aiAHNgIEIAhBf2ohCEEBIQkMAQsgBkEAIA0gCUEQdEEQdUobIQYLIAsgD2ogCTsBACACIAdHIQkgB0EBaiEHIAkNAAsgACAFNgIEIAAgBjYCACAKQQN2IApBAXZqQQNqIQlBACEHQQAhBgNAIAEgBkEBdGouAQAiAEEBTgRAIABB//8DcSIAQQEgAEEBSxshDUEAIQADQCAMIAdBA3RqIAY2AgQDQCAHIAlqIA5xIgcgCEsNAAsgAEEBaiIAIA1HDQALCyACIAZGIQAgBkEBaiEGIABFDQALCyAKQQEgCkEBSxshAkEAIQgDQCALIAwgCEEDdGoiACgCBCIGQQF0aiIBIAEvAQAiAUEBajsBACAAIAUgARAkayIHOgADIAAgASAHdCAKazsBACAAIAQgBkECdCIBaigCADoAAiAAIAEgA2ooAgA2AgQgCEEBaiIIIAJHDQALIAtB8ABqJAALPAEDfwNAIAAgA0ECdGoiAiACKAIAQQR0QX9qIgI2AgAgAiAEaiEEIAEgA0chAiADQQFqIQMgAg0ACyAECwQAIAALHQAgAEHAAE8EQCAAECRBE2oPCyAAQfClAWotAAALUQAgAiABayECAn8gBUUEQCABIAIgAyAEIAYQcQwBCyABIAIgAyAEIAYQ+gMLIgUQISAFRXJFBEAgASAFaiAAayIAQQAgACAEQX9qSRsPCyAFCx8AIAAgASACLwEAEEY2AgAgARAjGiAAIAJBBGo2AgQLNwEBfyADQdsLTQRAIAAgASACIAMQqgEPC0F/IQUgBEEDcQR/IAUFIAAgASACIANBACAEEIMCCwsjAEIAIAEQTiAAhUKHla+vmLbem55/fkLj3MqV/M7y9YV/fAsNACABIABBAnRqKAIAC0ABAX8jAEEgayIAJAAgAEEIahC0BEGg7AEgACgCGDYCAEGY7AEgACkDEDcCAEGQ7AEgACkDCDcCACAAQSBqJAALPAACQCAAKAJEQQFHBEAgACgCFCAAKAIkbUEBSg0BCyAAELkCDwsgABC4AiAAQoGAgIBwNwLAESAAKAIsC6sDAQN/IAEgAEEEaiIEakF/akEAIAFrcSIFIAJqIAAgACgCACIBakF8ak0EfyAAKAIEIgMgACgCCDYCCCAAKAIIIAM2AgQgBCAFRwRAIAAgAEF8aigCACIDQR91IANzayIDIAUgBGsiBCADKAIAaiIFNgIAIAVBfHEgA2pBfGogBTYCACAAIARqIgAgASAEayIBNgIACwJAIAJBGGogAU0EQCAAIAJqQQhqIgMgASACayIBQXhqIgQ2AgAgBEF8cSADakF8akEHIAFrNgIAIAMCfyADKAIAQXhqIgFB/wBNBEAgAUEDdkF/agwBCyABZyEEIAFBHSAEa3ZBBHMgBEECdGtB7gBqIAFB/x9NDQAaIAFBHiAEa3ZBAnMgBEEBdGtBxwBqIgFBPyABQT9JGwsiAUEEdCIEQYDtAWo2AgQgAyAEQYjtAWoiBCgCADYCCCAEIAM2AgAgAygCCCADNgIEQYj1AUGI9QEpAwBCASABrYaENwMAIAAgAkEIaiIBNgIAIAFBfHEgAGpBfGogATYCAAwBCyAAIAFqQXxqIAE2AgALIABBBGoFIAMLC0sBAn8gACgCBCIGQQh1IQcgACgCACIAIAEgAiAGQQFxBH8gAygCACAHaigCAAUgBwsgA2ogBEECIAZBAnEbIAUgACgCACgCFBEMAAtdAQF/IAAoAhAiA0UEQCAAQQE2AiQgACACNgIYIAAgATYCEA8LAkAgASADRgRAIAAoAhhBAkcNASAAIAI2AhgPCyAAQQE6ADYgAEECNgIYIAAgACgCJEEBajYCJAsLIAACQCAAKAIEIAFHDQAgACgCHEEBRg0AIAAgAjYCHAsLogEAIABBAToANQJAIAAoAgQgAkcNACAAQQE6ADQgACgCECICRQRAIABBATYCJCAAIAM2AhggACABNgIQIANBAUcNASAAKAIwQQFHDQEgAEEBOgA2DwsgASACRgRAIAAoAhgiAkECRgRAIAAgAzYCGCADIQILIAAoAjBBAUcgAkEBR3INASAAQQE6ADYPCyAAQQE6ADYgACAAKAIkQQFqNgIkCws3AQJ/IABB/OMBNgIAAn8gACgCBEF0aiICIgEgASgCCEF/aiIBNgIIIAFBf0wLBEAgAhA4CyAAC4oRAg9/AX4jAEHQAGsiBSQAIAUgATYCTCAFQTdqIRMgBUE4aiERQQAhAQJAA0ACQCANQQBIDQAgAUH/////ByANa0oEQEGw7AFBPTYCAEF/IQ0MAQsgASANaiENCyAFKAJMIgkhAQJAAkACQCAJLQAAIgYEQANAAkACQCAGQf8BcSIGRQRAIAEhBgwBCyAGQSVHDQEgASEGA0AgAS0AAUElRw0BIAUgAUECaiIHNgJMIAZBAWohBiABLQACIQogByEBIApBJUYNAAsLIAYgCWshASAABEAgACAJIAEQZgsgAQ0GIAUoAkwiB0EBaiEBQX8hDwJAIAcsAAEiBhBuRQ0AIActAAJBJEcNACAHQQNqIQEgBkFQaiEPQQEhEgsgBSABNgJMQQAhDgJAIAEsAAAiCkFgaiIHQR9LBEAgASEGDAELIAEhBkEBIAd0IgdBidEEcUUNAANAIAUgAUEBaiIGNgJMIAcgDnIhDiABLAABIgpBYGoiB0EgTw0BIAYhAUEBIAd0IgdBidEEcQ0ACwsCQCAKQSpGBEACfwJAIAYsAAEiARBuRQ0AIAYtAAJBJEcNACABQQJ0IARqQcB+akEKNgIAIAZBA2ohASAGLAABQQN0IANqQYB9aigCACELQQEMAQsgEg0GIAZBAWohASAARQRAIAUgATYCTEEAIRJBACELDAMLIAIgAigCACIGQQRqNgIAIAYoAgAhC0EACyESIAUgATYCTCALQX9KDQFBACALayELIA5BgMAAciEODAELIAVBzABqELwBIgtBAEgNBCAFKAJMIQELQX8hCAJAIAEtAABBLkcNACABLQABQSpGBEACQAJAIAEsAAIiBhBuRQ0AIAEtAANBJEcNACAGQQJ0IARqQcB+akEKNgIAIAEsAAJBA3QgA2pBgH1qKAIAIQggAUEEaiEBDAELIBINBiABQQJqIQEgAEUEQEEAIQgMAQsgAiACKAIAIgZBBGo2AgAgBigCACEICyAFIAE2AkwMAQsgBSABQQFqNgJMIAVBzABqELwBIQggBSgCTCEBC0EAIQcDQCAHIRBBfyEMIAEiCiwAAEG/f2pBOUsNCCAFIApBAWoiATYCTCAKLAAAIBBBOmxqQf/PAWotAAAiB0F/akEISQ0ACwJAAkAgB0ETRwRAIAdFDQogD0EATgRAIAQgD0ECdGogBzYCACAFIAMgD0EDdGopAwA3A0AMAgsgAEUNCCAFQUBrIAcgAhC7AQwCCyAPQX9KDQkLQQAhASAARQ0HCyAOQf//e3EiBiAOIA5BgMAAcRshB0EAIQxBkNQBIQ8gESEOAkACQAJAAn8CQAJAAkACQAJ/AkACQAJAAkACQAJAAkAgCiwAACIBQV9xIAEgAUEPcUEDRhsgASAQGyIBQah/ag4hBBQUFBQUFBQUDhQPBg4ODhQGFBQUFAIFAxQUCRQBFBQEAAsCQCABQb9/ag4HDhQLFA4ODgALIAFB0wBGDQkMEwsgBSkDQCEUQZDUAQwFC0EAIQECQAJAAkACQAJAAkACQCAQQf8BcQ4IAAECAwQaBQYaCyAFKAJAIA02AgAMGQsgBSgCQCANNgIADBgLIAUoAkAgDaw3AwAMFwsgBSgCQCANOwEADBYLIAUoAkAgDToAAAwVCyAFKAJAIA02AgAMFAsgBSgCQCANrDcDAAwTCyAIQQggCEEISxshCCAHQQhyIQdB+AAhAQsgBSkDQCARIAFBIHEQ2wIhCSAHQQhxRQ0DIAUpA0BQDQMgAUEEdkGQ1AFqIQ9BAiEMDAMLIAUpA0AgERDaAiEJIAdBCHFFDQIgCCARIAlrIgFBAWogCCABShshCAwCCyAFKQNAIhRCf1cEQCAFQgAgFH0iFDcDQEEBIQxBkNQBDAELIAdBgBBxBEBBASEMQZHUAQwBC0GS1AFBkNQBIAdBAXEiDBsLIQ8gFCARENkCIQkLIAdB//97cSAHIAhBf0obIQcgCCAFKQNAIhRQRXJFBEBBACEIIBEhCQwMCyAIIBRQIBEgCWtqIgEgCCABShshCAwLCyAFKAJAIgFBmtQBIAEbIgkgCBDYAiIBIAggCWogARshDiAGIQcgASAJayAIIAEbIQgMCgsgCARAIAUoAkAMAgtBACEBIABBICALQQAgBxBeDAILIAVBADYCDCAFIAUpA0A+AgggBSAFQQhqNgJAQX8hCCAFQQhqCyEGQQAhAQJAA0AgBigCACIJRQ0BIAVBBGogCRC6ASIKQQBIIgkgCiAIIAFrS3JFBEAgBkEEaiEGIAggASAKaiIBSw0BDAILC0F/IQwgCQ0LCyAAQSAgCyABIAcQXiABRQRAQQAhAQwBC0EAIQogBSgCQCEGA0AgBigCACIJRQ0BIAVBBGogCRC6ASIJIApqIgogAUoNASAAIAVBBGogCRBmIAZBBGohBiAKIAFJDQALCyAAQSAgCyABIAdBgMAAcxBeIAsgASALIAFKGyEBDAgLIAAgBSsDQCALIAggByABQQARIAAhAQwHCyAFIAUpA0A8ADdBASEIIBMhCSAGIQcMBAsgBSABQQFqIgc2AkwgAS0AASEGIAchAQwACwALIA0hDCAADQQgEkUNAkEBIQEDQCAEIAFBAnRqKAIAIgAEQCADIAFBA3RqIAAgAhC7AUEBIQwgAUEBaiIBQQpHDQEMBgsLQQEhDCABQQpPDQRBACEGA0AgBg0BIAFBAWoiAUEKRg0FIAQgAUECdGooAgAhBgwACwALQX8hDAwDCyAAQSAgDCAOIAlrIgogCCAIIApIGyIGaiIQIAsgCyAQSBsiASAQIAcQXiAAIA8gDBBmIABBMCABIBAgB0GAgARzEF4gAEEwIAYgCkEAEF4gACAJIAoQZiAAQSAgASAQIAdBgMAAcxBeDAELC0EAIQwLIAVB0ABqJAAgDAsWACAARQRAQQAPC0Gw7AEgADYCAEF/CyIBAX8jAEEQayIBIAA2AgggASABKAIIKAIENgIMIAEoAgwLCgAgAC0AC0EHdgsRACAAEJEBBEAgACgCABA4CwvYAQEIf0G6fyEJAkAgACACKAIEIgggAigCACIKaiINaiABSw0AQWwhCSADKAIAIg4gCmoiDyAESw0AIAAgCmoiBCACKAIIIgtrIQwgACABQWBqIgEgDiAKQQAQxAEgAyAPNgIAAkACQCALIAQgBWtNBEAgDCEFDAELIAsgBCAGa0sNAiAHIAwgBWsiA2oiACAIaiAHTQRAIAQgACAIEEoaDAILIAQgAEEAIANrEEohACACIAMgCGoiCDYCBCAAIANrIQQLIAQgASAFIAhBARDEAQsgDSEJCyAJC4wCAQJ/IwBBgAFrIg4kACAOIAM2AnxBfyENAkACQAJAAkACQCACDgQBAAMCBAsgBkUEQEG4fyENDAQLQWwhDSAFLQAAIgIgA0sNAyAAIAcgAkECdCICaigCACACIAhqKAIAEPgCIAEgADYCAEEBIQ0MAwsgASAJNgIAQQAhDQwCCyAKRQRAQWwhDQwCC0EAIQ0gC0UgDEEZSHINAUEIIAR0QQhqIQBBACEDA0AgA0FAayIDIABJDQALDAELQWwhDSAOIA5B/ABqIA5B+ABqIAUgBhBrIgIQIQ0AIA4oAngiAyAESw0AIAAgDiAOKAJ8IAcgCCADEH0gASAANgIAIAIhDQsgDkGAAWokACANCxAAIAAvAAAgAC0AAkEQdHILEQAgACABQQRqIAEoAgAQ5gILXgEBf0G4fyEDIAIQaSICIAFNBH8gACACakF/ai0AACIAQQNxQQJ0QcCrAWooAgAgAmogAEEGdiIBQQJ0QdCrAWooAgBqIABBIHFBBXYiAEEBc2ogACABRXFqBSADCwsVACAAIAFBA3RqKAIEQf//A2pBEHYLdgECfyMAQSBrIgUkACABIAIgBCgCECIGENgBQX8gBnRBf3NGBEAgACgCGCEGIAAoAhQhACAFIAQpAhA3AxggBSAEKQIINwMQIAUgBCkCADcDCCAAIAYgASACENcBIAMgASACENUBIAVBCGoQpwMLIAVBIGokAAuaAQACfwJAAkACQCAAKAKEAUF7ag4DAQICAAtBACAAKAIEIAAoAhhqIAFLDQIaIAAgAUEEEFQgACABIAIgA0EEQQEQUw8LQQAgACgCBCAAKAIYaiABSw0BGiAAIAFBBRBUIAAgASACIANBBUEBEFMPC0EAIAAoAgQgACgCGGogAUsNABogACABQQYQVCAAIAEgAiADQQZBARBTCwuaAQACfwJAAkACQCAAKAKEAUF7ag4DAQICAAtBACAAKAIEIAAoAhhqIAFLDQIaIAAgAUEEEFQgACABIAIgA0EEQQIQUw8LQQAgACgCBCAAKAIYaiABSw0BGiAAIAFBBRBUIAAgASACIANBBUECEFMPC0EAIAAoAgQgACgCGGogAUsNABogACABQQYQVCAAIAEgAiADQQZBAhBTCwuaAQACfwJAAkACQCAAKAKEAUF7ag4DAQICAAtBACAAKAIEIAAoAhhqIAFLDQIaIAAgAUEEEFQgACABIAIgA0EEQQAQUw8LQQAgACgCBCAAKAIYaiABSw0BGiAAIAFBBRBUIAAgASACIANBBUEAEFMPC0EAIAAoAgQgACgCGGogAUsNABogACABQQYQVCAAIAEgAiADQQZBABBTCwt6AQN/Qbp/IQUgA0H/H0tBAkEBIANBH0sbaiIEIANqIgYgAU0EfwJAAkACQAJAIARBf2oOAwABAgMLIAAgA0EDdDoAAAwCCyAAIANBBHRBBHJB9P8DcRAvDAELIAAgA0EEdEEMchBNCyAAIARqIAIgAxAqGiAGBSAFCws5AQJ/IAAoAhQhAyAAKAIMIQIgAEECEOEBIAEgAmoiASADSwRAIABBATYCGEEADwsgACABNgIMIAILTAEBfyABEOMBIQECQCAAKAIgRQRAIAAoAggiAiABaiIBIAAoAgRNDQELIABBATYCGEEADwsgACABNgIQIAAgATYCDCAAIAE2AgggAgvjAwEGfyABQRBtIQggAUEQTgRAA0AgACAGQQJ0IgVqIgFBACABKAIAIgEgAmsiAyADIAFLGzYCACAAIAVBBHJqIgFBACABKAIAIgMgAmsiBCAEIANLGzYCACABQQAgASgCBCIBIAJrIgMgAyABSxs2AgQgACAFQQxyaiIBQQAgASgCACIDIAJrIgQgBCADSxs2AgAgAUEAIAEoAgQiAyACayIEIAQgA0sbNgIEIAFBACABKAIIIgMgAmsiBCAEIANLGzYCCCABQQAgASgCDCIBIAJrIgMgAyABSxs2AgwgACAFQRxyaiIBQQAgASgCACIDIAJrIgQgBCADSxs2AgAgAUEAIAEoAgQiAyACayIEIAQgA0sbNgIEIAFBACABKAIIIgMgAmsiBCAEIANLGzYCCCABQQAgASgCDCIDIAJrIgQgBCADSxs2AgwgAUEAIAEoAhAiAyACayIEIAQgA0sbNgIQIAFBACABKAIUIgMgAmsiBCAEIANLGzYCFCABQQAgASgCGCIDIAJrIgQgBCADSxs2AhggAUEAIAEoAhwiASACayIDIAMgAUsbNgIcIAAgBUE8cmoiAUEAIAEoAgAiASACayIFIAUgAUsbNgIAIAZBEGohBiAHQQFqIgcgCEcNAAsLC5ICAQJ/IwBB8ABrIhAkAEF/IQ8CQAJAAkACQAJAIAQOBAIAAwEECyACIAZB/wFxEIcEQQAhD0EAECENAyABRQRAQbp/IQ8MBAsgACAHLQAAOgAAQQEhDwwDCyACIAwgDRAqGkEAIQ8MAgsgAiAJIAsgCiAOQYAwEKkBIgAQISEBIBBB8ABqJAAgAEEAIAEbDwsgECADIAggBhCnASIEIAUgBSAHIAhBf2oiA2otAABBAnRqIgcoAgAiCUECTwR/IAcgCUF/ajYCACADBSAICyAGEKYBIg8QIQ0AIAAgASAQIAYgBBCoASIPECENACACIBAgBiAEIA5BgDAQqQEiACAPIAAQIRshDwsgEEHwAGokACAPC+ABAAJAIAMgBEcEQAJAAkAgCkEDTQRAIAlFDQEgBEHnB00EQEEDIQkgACgCAEECRg0DC0EKIAprIAh0QQN2IARLDQQgBCAIQX9qdiADTQ0BDAQLQX8hCkF/IQMgCQRAIAcgCCABIAIQzQMhAwtBAyEJAn8gACgCAARAIAYgASACEMwDIQoLIAMgCk0LQQAgAyABIAIgBCAFEMsDQQN0IAEgAiAEEMoDaiIBTRsNAyAKIAFNDQELIABBATYCAEECIQkLIAkPCyAAQQA2AgAgCUUgA0ECS3IPCyAAQQA2AgBBAAsXACAAIAFB//8DcRAvIAAgAUEQdjoAAgs4AQF/IABCADcCCCAAQgA3AhAgAEIANwIYIABBADYCICAAKAIAIQQgAEIANwIAIAQgASACIAMQZAvBAQEDfwJAIAIoAhAiAwR/IAMFIAIQhQQNASACKAIQCyACKAIUIgVrIAFJBEAgAiAAIAEgAigCJBEBAA8LAkAgAiwAS0EASARAQQAhAwwBCyABIQQDQCAEIgNFBEBBACEDDAILIAAgA0F/aiIEai0AAEEKRw0ACyACIAAgAyACKAIkEQEAIgQgA0kNASAAIANqIQAgASADayEBIAIoAhQhBQsgBSAAIAEQKhogAiACKAIUIAFqNgIUIAEgA2ohBAsgBAv9AgIIfwV+AkACf0F/IAFBCyABGyIGQQVJDQAaQVQgBkEMSw0AGkF/IAYgAyAEEIACSQ0AGiADIAZ2IQxBASAGdCEHQoCAgICAgICAwAAgA62AIQ5BPiAGa60iDUJsfCEPQQAhAQJAA0AgAiABQQJ0aigCACIFIANGDQECQCAFRQRAIAAgAUEBdGpBADsBAAwBCyAFIAxNBEAgACABQQF0akH//wM7AQAgB0F/aiEHDAELIA4gBa1+IhAgDYgiEaciBUH//wNxIgpBB00EQCAQIBFC//8DgyANhn0gCkECdEHghAFqNQIAIA+GViAFaiEFCyAAIAFBAXRqIAU7AQAgBSAIIAVBEHRBEHUiBSAIQRB0QRB1SiIKGyEIIAEgCSAKGyEJIAcgBWshBwsgAUEBaiIBIARNDQALIAAgCUEBdGoiAS4BACIFQQF1QQAgB2tKDQIgBiIFIAAgBSACIAMgBBCIBCILECFFDQEaCyALCw8LIAEgBSAHajsBACAGCw0AIAAgASACQQIQgQILUgACf0FUIARBDEsNABpBfyAEQQVJDQAaIANBAWogBGxBA3ZBA2pBgAQgAxsgAUsEQCAAIAEgAiADIARBABCCAg8LIAAgASACIAMgBEEBEIICCwvIBAEKfyMAQZAIayIJJABBASEGQVQhB0EBIAN0IgggBU0EQCAIQQF2IgxBASADG0ECdCEKIAAgAzsBACAAQQRqIg5BfmogAjsBAEEAIQAgCUEANgIAIAhBf2oiBSEHIAJBAWoiCyACTwRAIAUhBwNAIAkgBkECdGoCfyABIAZBf2oiDUEBdGouAQAiD0F/RgRAIAQgB2ogDToAACAHQX9qIQcgAEEBagwBCyAAIA9qCyIANgIAIAZBAWoiBiALTQ0ACwsgCiAOaiEKIAkgC0ECdGogCEEBajYCACAIQQN2IAxqQQNqIQxBACEAQQAhBgNAIAEgAEEBdGouAQAiDUEBTgRAQQAhCwNAIAQgBmogADoAAANAIAYgDGogBXEiBiAHSw0ACyALQQFqIgsgDUcNAAsLIABBAWoiACACTQ0ACyAIQQEgCEEBSxshAEEAIQYDQCAJIAQgBmotAABBAnRqIgUgBSgCACIFQQFqNgIAIA4gBUEBdGogBiAIajsBACAGQQFqIgYgAEcNAAsgA0EQdCAIayIEQYCABGohBUEAIQZBACEHA0ACQAJAAkACQCABIAZBAXRqLgEAIgBBAWoOAwEAAQILIAogBkEDdGogBTYCBAwCCyAKIAZBA3RqIgAgB0F/ajYCACAAIAQ2AgQgB0EBaiEHDAELIAogBkEDdGoiCCAHIABrNgIAIAggAyAAQX9qECRrIghBEHQgACAIdGs2AgQgACAHaiEHCyAGQQFqIgYgAk0NAAtBACEHCyAJQZAIaiQAIAcLrwEBAn8gAEEAIAEoAgAiAEECdEEEahAoIQQgAwRAIANBAEoEQCACIANqIQMDQCAEIAItAABBAnRqIgUgBSgCAEEBajYCACACQQFqIgIgA0kNAAsLA0AgACICQX9qIQAgBCACQQJ0aigCAEUNAAsgASACNgIAQQAhA0EAIQADQCAEIANBAnRqKAIAIgEgACABIABLGyEAIANBAWoiAyACTQ0ACyAADwsgAUEANgIAQQALCwAgACABIAIQKhoLmg0BF38jAEFAaiIHQgA3AzAgB0IANwM4IAdCADcDICAHQgA3AygCQAJAAn8CQAJAIAIEQANAIAdBIGogASAIQQF0ai8BAEEBdGoiBiAGLwEAQQFqOwEAIAhBAWoiCCACRw0ACyAEKAIAIQhBDyEKIAcvAT4iDA0CIAcvATxFDQFBDiEKQQAhDAwCCyAEKAIAIQgLQQ0hCkEAIQwgBy8BOg0AQQwhCiAHLwE4DQBBCyEKIAcvATYNAEEKIQogBy8BNA0AQQkhCiAHLwEyDQBBCCEKIAcvATANAEEHIQogBy8BLg0AQQYhCiAHLwEsDQBBBSEKIAcvASoNAEEEIQogBy8BKA0AQQMhCiAHLwEmDQBBAiEKIAcvASQNACAHLwEiIgtFBEAgAyADKAIAIgBBBGo2AgAgAEHAAjYBACADIAMoAgAiAEEEajYCACAAQcACNgEAIARBATYCAAwDCyAIQQBHIQ5BASEKQQEhCEEADAELIAogCCAIIApLGyEOQQEhCAJAA0AgB0EgaiAIQQF0ai8BAA0BIAhBAWoiCCAKRw0ACyAKIQgLIAcvASIhC0EBCyEQQX8hCSALQf//A3EiBkECSw0BQQQgBy8BJCIRIAZBAXRqayIGQQBIDQEgBkEBdCAHLwEmIhJrIgZBAEgNASAGQQF0IAcvASgiE2siBkEASA0BIAZBAXQgBy8BKiIUayIGQQBIDQEgBkEBdCAHLwEsIhVrIgZBAEgNASAGQQF0IAcvAS4iGGsiBkEASA0BIAZBAXQgBy8BMCIbayIGQQBIDQEgBkEBdCAHLwEyIhxrIgZBAEgNASAGQQF0IAcvATQiDWsiBkEASA0BIAZBAXQgBy8BNiIWayIGQQBIDQEgBkEBdCAHLwE4IhdrIgZBAEgNASAGQQF0IAcvAToiGWsiBkEASA0BIAZBAXQgBy8BPCIaayIGQQBIDQEgBkEBdCAMayIGQQBIIAZBACAARSAQchtyDQFBACEJIAdBADsBAiAHIAs7AQQgByALIBFqIgY7AQYgByAGIBJqIgY7AQggByAGIBNqIgY7AQogByAGIBRqIgY7AQwgByAGIBVqIgY7AQ4gByAGIBhqIgY7ARAgByAGIBtqIgY7ARIgByAGIBxqIgY7ARQgByAGIA1qIgY7ARYgByAGIBZqIgY7ARggByAGIBdqIgY7ARogByAGIBlqIgY7ARwgByAGIBpqOwEeIAIEQANAIAEgCUEBdGovAQAiBgRAIAcgBkEBdGoiBiAGLwEAIgZBAWo7AQAgBSAGQQF0aiAJOwEACyAJQQFqIgkgAkcNAAsLIAggDiAOIAhJGyENQRMhDkEAIRQgBSEWIAUhF0EAIRACQAJAAkAgAA4CAgABC0EBIQkgDUEJSw0DQYACIQ5B3uoAIRdB3ukAIRZBASEQDAELIABBAkYhFEF/IQ5BoO4AIRdBoO0AIRYgAEECRwRADAELQQEhCSANQQlLDQILQQEgDXQiEUF/aiEbIAMoAgAhEkEAIRMgDSEGQQAhC0F/IRoDQEEBIAZ0IRkCQANAIAggD2shFQJ/QQAgDiAFIBNBAXRqLwEAIgZKDQAaIA4gBk4EQEEAIQZB4AAMAQsgFiAGQQF0IgBqLwEAIQYgACAXai0AAAshACALIA92IRxBfyAVdCEJIBkhAgNAIBIgAiAJaiICIBxqQQJ0aiIYIAY7AQIgGCAVOgABIBggADoAACACDQALQQEgCEF/anQhCQNAIAkiAEEBdiEJIAAgC3ENAAsgB0EgaiAIQQF0aiICIAIvAQBBf2oiAjsBACAAQX9qIAtxIABqQQAgABshCyATQQFqIRMgAkH//wNxRQRAIAggCkYNAiABIAUgE0EBdGovAQBBAXRqLwEAIQgLIAggDU0NACALIBtxIgAgGkYNAAtBASAIIA8gDSAPGyIPayIGdCEMIAggCkkEQCAKIA9rIQIgCCEJAkADQCAMIAdBIGogCUEBdGovAQBrIglBAUgNASAJQQF0IQwgBkEBaiIGIA9qIgkgCkkNAAsgAiEGC0EBIAZ0IQwLQQEhCSAQIAwgEWoiEUHUBktxIBQgEUHQBEtxcg0DIAMoAgAiAiAAQQJ0aiIJIA06AAEgCSAGOgAAIAkgEiAZQQJ0aiISIAJrQQJ2OwECIAAhGgwBCwsgCwRAIBIgC0ECdGoiAEEAOwECIAAgFToAASAAQcAAOgAACyADIAMoAgAgEUECdGo2AgAgBCANNgIAC0EAIQkLIAkLygIBC38gACACQQJ0akHcFmooAgAhBgJAIAJBAXQiAyAAKALQKCIFSgRAIAIhBAwBCyAAIAZqQdgoaiEKIAEgBkECdGohCyAAQdwWaiEIIABB2ChqIQkDQAJ/IAMgAyAFTg0AGiABIAggA0EBciIFQQJ0aigCACIHQQJ0ai8BACIEIAEgCCADQQJ0aigCACIMQQJ0ai8BACINTwRAIAMgBCANRw0BGiADIAcgCWotAAAgCSAMai0AAEsNARoLIAULIQQgCy8BACIFIAEgACAEQQJ0akHcFmooAgAiA0ECdGovAQAiB0kEQCACIQQMAgsCQCAFIAdHDQAgCi0AACAAIANqQdgoai0AAEsNACACIQQMAgsgACACQQJ0akHcFmogAzYCACAEIgJBAXQiAyAAKALQKCIFTA0ACwsgACAEQQJ0akHcFmogBjYCAAuyBQEKfyABKAIIIgMoAgAhByADKAIMIQUgASgCACEGIABCgICAgNDHADcC0ChBfyEDAkAgBUEASgRAA0ACQCAGIAJBAnRqIgQvAQAEQCAAIAAoAtAoQQFqIgM2AtAoIAAgA0ECdGpB3BZqIAI2AgAgACACakHYKGpBADoAACACIQMMAQsgBEEAOwECCyACQQFqIgIgBUcNAAsgACgC0CgiAkEBSg0BCwNAIAAgAkEBaiICNgLQKCAAIAJBAnRqQdwWaiADQQFqIglBACADQQJIIgQbIgg2AgAgBiAIQQJ0IgJqQQE7AQAgACAIakHYKGpBADoAACAAIAAoAqgtQX9qNgKoLSAHBEAgACAAKAKsLSACIAdqLwECazYCrC0LIAkgAyAEGyEDIAAoAtAoIgJBAkgNAAsLIAEgAzYCBCACQQF2IQIDQCAAIAYgAhCtASACQQFKIQQgAkF/aiECIAQNAAsgACgC0CghAiAAQdwWaiEKIABB2ChqIQsDQCAAIAJBf2o2AtAoIAAoAuAWIQcgACAKIAJBAnRqKAIANgLgFiAAIAZBARCtASAAIAAoAtQoQX9qIgI2AtQoIAAoAuAWIQQgCiACQQJ0aiAHNgIAIAAgACgC1ChBf2oiAjYC1CggCiACQQJ0aiAENgIAIAYgBUECdGogBiAEQQJ0aiIILwEAIAYgB0ECdGoiCS8BAGo7AQAgBSALaiAEIAtqLQAAIgQgByALai0AACICIAIgBEkbQQFqOgAAIAggBTsBAiAJIAU7AQIgACAFNgLgFiAAIAZBARCtASAFQQFqIQUgACgC0CgiAkEBSg0ACyAAIAAoAtQoQX9qIgI2AtQoIAAgAkECdGpB3BZqIAAoAuAWNgIAIAAgASgCACABKAIEIAEoAggQlAQgBiADIABBvBZqEJMEC5gCAQN/QX4hAgJAIABFDQAgACgCHCIBRQ0AAkACQCABKAIEIgNBu39qDi0BAgICAQICAgICAgICAgICAgICAgICAQICAgICAgICAgICAQICAgICAgICAgEACyADQZoFRg0AIANBKkcNAQsCfwJ/An8gASgCCCICBEAgACgCKCACIAAoAiQRBAAgACgCHCEBCyABKAJEIgILBEAgACgCKCACIAAoAiQRBAAgACgCHCEBCyABKAJAIgILBEAgACgCKCACIAAoAiQRBAAgACgCHCEBCyABKAI4IgILBEAgACgCKCACIAAoAiQRBAAgACgCHCEBCyAAKAIoIAEgACgCJBEEACAAQQA2AhxBfUEAIANB8QBGGyECCyACCx0AIABBCSABIAFBAUgbIgBBDCAAQQxIGzsBmIAQC6IDAQZ/IwBBEGsiAyQAAn8gACgCBCIBIAAoAggiAkYEQCAAKAIAIgIgACgCDCACKAIAKAIQEQQAIAAoAgAiAiADQQxqIAIoAgAoAgwRAwAhASAAIAMoAgwiAjYCDCACRQRAIABBAToAEEEADAILIAAgASACaiICNgIICwJAIAIgAWsiAiABLQAAQQF0QcAJai8BAEELdkEBaiIESQRAIABBEWogASACEEohBiAAKAIAIgEgACgCDCABKAIAKAIQEQQAIABBADYCDANAIAAoAgAiASADQQhqIAEoAgAoAgwRAwAhBUEAIAMoAggiAUUNAxogACACakERaiAFIAEgBCACayIFIAEgBUkbIgEQKhogACgCACIFIAEgBSgCACgCEBEEACABIAJqIgIgBEkNAAsgACAGNgIEIAAgACAEakERajYCCAwBCyACQQRNBEAgAEERaiABIAIQSiEBIAAoAgAiBCAAKAIMIAQoAgAoAhARBAAgACABIAJqNgIIIAAgATYCBCAAQQA2AgwMAQsgACABNgIEC0EBCyECIANBEGokACACCx4BAX8gAEEFRiABQRBKcgR/IAMFIAIgAW1B/wBKCwvCAgEKfyAAKAIMLQAAIghBAnYgACgCKCIJIAFMcSENIAggCUEBSnEhDiAAKAIYIQsgASEKQQEhDAJAAkACQCAIQRBxIAlBEEpyDQAgAiABIAltIghBgAFIcg0AIAghCiAJIQwgCUEBTg0ADAELIAYgBiAFIA0bIA4bIQIgCiAMbCEPIAtBfGohEANAQX8hCCAEQQBIIAQgEEtyDQIgAyAEaigAACILQQBIDQIgCyAAKAIYIARBBGoiBGtKDQIgAyAEaiEIAkAgCiALRgRAIAIgCCAKEFAaDAELIAggCyACIAogACgCQBEHACAKRg0AQX4PCyACIApqIQIgBCALaiEEIBFBAWoiESAMRw0ACwsCQCAOBEAgCSABIAYgBRCtAgwBCyANRQ0AIAkgASAGIAUgBxCsAiIIQQBIDQELIA8hCAsgCAufBQEKfyMAQRBrIgokAAJAAkAgACgCDC0AACIJQQFxRSAAKAIoIgtBAkhyRQRAIAsgASAFIAcQswIMAQsgCyABSgRAIAUhBwwBCyAJQQRxRQRAIAUhBwwBCyALIAEgBSAHIAgQsgIiCEEASA0BCyABQQEgCyAJQRBxIAJyGyINbSEFIAAiASgCOEEBRgR/QQogASgCPGsFQQELIQ4gDUEBSARAQQAhCAwBC0EAIQJBACEIA0AgA0EEaiEMIAUhAyAAKAI4QQNGBEAgBRCVAiEDCwJAIAMgDGogBEwNACAEIAxrIgNBAU4NAEEAIQgMAgsgBkEEaiEJAn8CQAJAAkACQAJAAkACQCAAKAI4IgEOBgYAAQIDBAULIAcgAiAFbGogCSAFIAMgDhCqAgwGCyAHIAIgBWxqIQ8gCSEBIAMhECAAKAI8IREgBSISQYCAgIB4TQR/IA8gASASIBAgERCpAgVBfwsMBQsgByACIAVsaiAFIAkgAxCxAgwECyAHIAIgBWxqIAUgCSADIAAoAjwQsAIMAwsgByACIAVsaiAFIAkgAyAAKAI8EK8CDAILIAogAUEFTQR/IAFBAnRBgBBqKAIABUEACzYCDCAKIAooAgwiAEGa1AEgABs2AgBB6BEgChBPQY8SQS8QckF7IQgMAwsgACgCPCAHIAIgBWxqIAUgCSADIAAoAgwtAAAgC0EBSnEQrgILIgEgA0oEQEF/IQgMAgsgAUEASARAQX4hCAwCCwJAIAFFIAEgBUZyRQRAIAEgDGohAwwBCyAFIAxqIgMgBEoEQEEAIQgMAwsgCSAHIAIgBWxqIAUQUBogBSEBCyAGIAEQNCAIQQRqIAFqIQggASAJaiEGIAJBAWoiAiANRw0ACwsgCkEQaiQAIAgL9AMCBX8CfgJAAkADQCAAIABBf2pxDQEgAEEIIABBCEsbIQBBiPUBKQMAIggCfyABQQNqQXxxQQggAUEISxsiAUH/AE0EQCABQQN2QX9qDAELIAFnIQIgAUEdIAJrdkEEcyACQQJ0a0HuAGogAUH/H00NABogAUEeIAJrdkECcyACQQF0a0HHAGoiAkE/IAJBP0kbCyIErYgiB1BFBEADQCAHIAd6IgiIIQcCfiAEIAinaiIEQQR0IgNBiO0BaigCACICIANBgO0BaiIGRwRAIAIgACABEIgBIgUNBiACKAIEIgUgAigCCDYCCCACKAIIIAU2AgQgAiAGNgIIIAIgA0GE7QFqIgMoAgA2AgQgAyACNgIAIAIoAgQgAjYCCCAEQQFqIQQgB0IBiAwBC0GI9QFBiPUBKQMAQn4gBK2JgzcDACAHQgGFCyIHQgBSDQALQYj1ASkDACEIC0E/IAh5p2tBBHQiAkGA7QFqIQMgAkGI7QFqKAIAIQICQCAIQoCAgIAEVA0AQeMAIQQgAiADRg0AA0AgBEUNASACIAAgARCIASIFDQQgBEF/aiEEIAIoAggiAiADRw0ACyADIQILIAFBMGoQtgENAAsgAiADRg0AA0AgAiAAIAEQiAEiBQ0CIAIoAggiAiADRw0ACwtBACEFCyAFC/0DAQZ/QejqASgCACICIABBA2pBfHEiA2ohAQJAIANBAU5BACABIAJNG0UEQCABPwBBEHRNDQEgARARDQELQbDsAUEwNgIAQQAPC0EAIQNB6OoBIAE2AgAgAkEBTgR/QRAhAyAAIAJqIgRBcGoiAEEQNgIMIABBEDYCAAJAAkACQEGA9QEoAgAiAUUNACACIAEoAghHDQAgAiACQXxqKAIAIgNBH3UgA3NrIgZBfGooAgAhBSABIAQ2AghBcCEDIAYgBSAFQR91c2siASABKAIAakF8aigCAEF/Sg0BIAEoAgQiAiABKAIINgIIIAEoAgggAjYCBCABIAAgAWsiADYCAAwCCyACQRA2AgwgAkEQNgIAIAIgBDYCCCACIAE2AgRBgPUBIAI2AgALIAIgA2oiASAAIAFrIgA2AgALIABBfHEgAWpBfGogAEF/czYCACABAn8gASgCAEF4aiIAQf8ATQRAIABBA3ZBf2oMAQsgAGchAiAAQR0gAmt2QQRzIAJBAnRrQe4AaiAAQf8fTQ0AGiAAQR4gAmt2QQJzIAJBAXRrQccAaiIAQT8gAEE/SRsLIgJBBHQiAEGA7QFqNgIEIAEgAEGI7QFqIgAoAgA2AgggACABNgIAIAEoAgggATYCBEGI9QFBiPUBKQMAQgEgAq2GhDcDAEEBBSADCwtSAQF/IAAoAgQhBCAAKAIAIgAgAQJ/QQAgAkUNABogBEEIdSIBIARBAXFFDQAaIAIoAgAgAWooAgALIAJqIANBAiAEQQJxGyAAKAIAKAIcEQgAC3UBA38CQAJAA0AgACABQcDUAWotAABHBEBB1wAhAiABQQFqIgFB1wBHDQEMAgsLIAEhAiABDQBBoNUBIQAMAQtBoNUBIQEDQCABLQAAIQMgAUEBaiIAIQEgAw0AIAAhASACQX9qIgINAAsLQfDsASgCABogAAsLACAAIAEgAhDcAgsSACAARQRAQQAPCyAAIAEQ1gILuwIAAkAgAUEUSw0AAkACQAJAAkACQAJAAkACQAJAAkAgAUF3ag4KAAECAwQFBgcICQoLIAIgAigCACIBQQRqNgIAIAAgASgCADYCAA8LIAIgAigCACIBQQRqNgIAIAAgATQCADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATUCADcDAA8LIAIgAigCAEEHakF4cSIBQQhqNgIAIAAgASkDADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATIBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATMBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATAAADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATEAADcDAA8LIAIgAigCAEEHakF4cSIBQQhqNgIAIAAgASsDADkDAA8LIAAgAkEAEQQACwtEAQR/IAAoAgAiAiwAACIDEG4EQANAIAAgAkEBaiIENgIAIAFBCmwgA2pBUGohASACLAABIQMgBCECIAMQbg0ACwsgAQsoAQF/IwBBEGsiASQAIAEgADYCDEHoywFBBSABKAIMEAAgAUEQaiQACygBAX8jAEEQayIBJAAgASAANgIMQZDMAUEEIAEoAgwQACABQRBqJAALKAEBfyMAQRBrIgEkACABIAA2AgxBuMwBQQMgASgCDBAAIAFBEGokAAsoAQF/IwBBEGsiASQAIAEgADYCDEHgzAFBAiABKAIMEAAgAUEQaiQACycBAX8jAEEQayIBJAAgASAANgIMQcwPQQEgASgCDBAAIAFBEGokAAsoAQF/IwBBEGsiASQAIAEgADYCDEGIzQFBACABKAIMEAAgAUEQaiQAC+ABAEH45gFBsMQBEBlBhOcBQbXEAUEBQQFBABAYEPMCEPICEPECEPACEO8CEO4CEO0CEOwCEOsCEOoCEOkCQbAOQZ/FARAHQejPAUGrxQEQB0GQzwFBBEHMxQEQAkG0zgFBAkHZxQEQAkHYzQFBBEHoxQEQAkGoDkH3xQEQFxDoAkGlxgEQwgFBysYBEMEBQfHGARDAAUGQxwEQvwFBuMcBEL4BQdXHARC9ARDlAhDkAkHAyAEQwgFB4MgBEMEBQYHJARDAAUGiyQEQvwFBxMkBEL4BQeXJARC9ARDjAhDiAguNBAEDfyMAQRBrIgUkACAFIAI2AgggBSAANgIMIAAgA2ohBwJAIANBB0wEQCADQQFIDQEDQCAAIAItAAA6AAAgAkEBaiECIABBAWoiACAHRw0ACyAFIAc2AgwgBSACNgIIDAELIARBAUYEQCAFQQxqIAVBCGogACACaxB8IAUoAgwhAAsgByABTQRAIAAgA2ohBiAEQQFHIAAgBSgCCCICa0EPSnJFBEADQCAAIAIQZyACQQhqIQIgAEEIaiIAIAZJDQAMAwsACyAAIAIQHCAAQRBqIAJBEGoQHCADQSFIDQEgAEEgaiEAA0AgACACQSBqIgEQHCAAQRBqIAJBMGoQHCABIQIgAEEgaiIAIAZJDQALDAELAkAgACABSwRAIAAhAQwBCwJAIARBAUcgACAFKAIIIgZrQQ9KckUEQCAAIQIgBiEDA0AgAiADEGcgA0EIaiEDIAJBCGoiAiABSQ0ACyABIABrIQQMAQsgACAGEBwgAEEQaiAGQRBqEBwgASAAayIEQSFIDQAgAEEgaiEAIAYhAgNAIAAgAkEgaiIDEBwgAEEQaiACQTBqEBwgAyECIABBIGoiACABSQ0ACwsgBSAEIAZqNgIICyABIAdPDQAgBSgCCCEAA0AgASAALQAAOgAAIABBAWohACABQQFqIgEgB0cNAAsgBSAHNgIMIAUgADYCCAsgBUEQaiQACwkAIAAoAgAQDAtBAQJ/IAAgACgCuOABIgM2AsTgASAAKAK84AEhBCAAIAE2ArzgASAAIAEgAmo2ArjgASAAIAEgBCADa2o2AsDgAQtbAQF/Qbh/IQMCQCABQQNJDQAgAiAAEJUBIgFBA3YiADYCCEEBIQMgAiABQQFxNgIEIAIgAUEBdkEDcSIBNgIAAkACQCABQX9qDgMCAQABC0FsDwsgACEDCyADCw4AIAAoAgAQFiAAKAIAC6wBAQF/IAAoAuzhASEBIABBADYChOEBIAAgARBpNgLI4AEgAEIANwP44AEgAEIANwO44AEgAEHA4AFqQgA3AwAgAEGo0ABqIgFBjICA4AA2AgAgAEEANgKY4gEgAEIANwOI4QEgAEGs0AFqQdCwASkCADcCACAAQbTQAWpB2LABKAIANgIAIAAgATYCDCAAIABBmCBqNgIIIAAgAEGgMGo2AgQgACAAQRBqNgIACx4AIAAoApDiARCXAyAAQQA2AqDiASAAQgA3A5DiAQu3EAEMfyMAQfAAayIFJABBbCEGAkAgA0EKSQ0AIAIvAAAhCyACLwACIQcgAi8ABCEMIAVBCGogBCgCABA0IAMgDCAHIAtqakEGaiIISQ0AIAUtAAohCSAFQdgAaiACQQZqIgIgCxBFIgYQIQ0AIAVBQGsgAiALaiICIAcQRSIGECENACAFQShqIAIgB2oiAiAMEEUiBhAhDQAgBUEQaiACIAxqIAMgCGsQRSIGECENACAEQQRqIQggACABQQNqQQJ2IgJqIgcgAmoiDCACaiILIAAgAWoiDkF9aiIPSSEKIAVB2ABqECMhAiAFQUBrECMhAyAFQShqECMhBAJAIAVBEGoQIyACIANyIARyciALIA9PckUEQCAHIQQgDCEDIAshAgNAIAggBSgCWCAFKAJcIAkQKUEBdGoiBi0AACEKIAVB2ABqIAYtAAEQJiAAIAo6AAAgCCAFKAJAIAUoAkQgCRApQQF0aiIGLQAAIQogBUFAayAGLQABECYgBCAKOgAAIAggBSgCKCAFKAIsIAkQKUEBdGoiBi0AACEKIAVBKGogBi0AARAmIAMgCjoAACAIIAUoAhAgBSgCFCAJEClBAXRqIgYtAAAhCiAFQRBqIAYtAAEQJiACIAo6AAAgCCAFKAJYIAUoAlwgCRApQQF0aiIGLQAAIQogBUHYAGogBi0AARAmIAAgCjoAASAIIAUoAkAgBSgCRCAJEClBAXRqIgYtAAAhCiAFQUBrIAYtAAEQJiAEIAo6AAEgCCAFKAIoIAUoAiwgCRApQQF0aiIGLQAAIQogBUEoaiAGLQABECYgAyAKOgABIAggBSgCECAFKAIUIAkQKUEBdGoiBi0AACEKIAVBEGogBi0AARAmIAIgCjoAASADQQJqIQMgBEECaiEEIABBAmohACAFQdgAahAjGiAFQUBrECMaIAVBKGoQIxogBUEQahAjGiACQQJqIgIgD0kNAAtBACEKDAELIAshAiAMIQMgByEECyADIAtLBEBBbCEGDAELIAQgDEsEQEFsIQYMAQtBbCEGIAAgB0sNAAJAIAVB2ABqECMgB0F9aiIGIABNcg0AA0AgCCAFKAJYIAUoAlwgCRApQQF0aiINLQAAIRAgBUHYAGogDS0AARAmIAAgEDoAACAIIAUoAlggBSgCXCAJEClBAXRqIg0tAAAhECAFQdgAaiANLQABECYgACAQOgABIAVB2ABqECMhDSAAQQJqIgAgBk8NASANRQ0ACwsCQCAFQdgAahAjIAAgB09yDQADQCAIIAUoAlggBSgCXCAJEClBAXRqIgYtAAAhDSAFQdgAaiAGLQABECYgACANOgAAIAVB2ABqECMhBiAAQQFqIgAgB08NASAGRQ0ACwsgACAHSQRAA0AgCCAFKAJYIAUoAlwgCRApQQF0aiIGLQAAIQ0gBUHYAGogBi0AARAmIAAgDToAACAAQQFqIgAgB0cNAAsLAkAgBUFAaxAjIAxBfWoiACAETXINAANAIAggBSgCQCAFKAJEIAkQKUEBdGoiBy0AACEGIAVBQGsgBy0AARAmIAQgBjoAACAIIAUoAkAgBSgCRCAJEClBAXRqIgctAAAhBiAFQUBrIActAAEQJiAEIAY6AAEgBUFAaxAjIQcgBEECaiIEIABPDQEgB0UNAAsLAkAgBUFAaxAjIAQgDE9yDQADQCAIIAUoAkAgBSgCRCAJEClBAXRqIgAtAAAhByAFQUBrIAAtAAEQJiAEIAc6AAAgBUFAaxAjIQAgBEEBaiIEIAxPDQEgAEUNAAsLIAQgDEkEQANAIAggBSgCQCAFKAJEIAkQKUEBdGoiAC0AACEHIAVBQGsgAC0AARAmIAQgBzoAACAEQQFqIgQgDEcNAAsLAkAgBUEoahAjIAtBfWoiACADTXINAANAIAggBSgCKCAFKAIsIAkQKUEBdGoiBC0AACEHIAVBKGogBC0AARAmIAMgBzoAACAIIAUoAiggBSgCLCAJEClBAXRqIgQtAAAhByAFQShqIAQtAAEQJiADIAc6AAEgBUEoahAjIQQgA0ECaiIDIABPDQEgBEUNAAsLAkAgBUEoahAjIAMgC09yDQADQCAIIAUoAiggBSgCLCAJEClBAXRqIgAtAAAhBCAFQShqIAAtAAEQJiADIAQ6AAAgBUEoahAjIQAgA0EBaiIDIAtPDQEgAEUNAAsLIAMgC0kEQANAIAggBSgCKCAFKAIsIAkQKUEBdGoiAC0AACEEIAVBKGogAC0AARAmIAMgBDoAACADQQFqIgMgC0cNAAsLAkAgBUEQahAjIApBAXNyDQADQCAIIAUoAhAgBSgCFCAJEClBAXRqIgAtAAAhAyAFQRBqIAAtAAEQJiACIAM6AAAgCCAFKAIQIAUoAhQgCRApQQF0aiIALQAAIQMgBUEQaiAALQABECYgAiADOgABIAVBEGoQIyEAIAJBAmoiAiAPTw0BIABFDQALCwJAIAVBEGoQIyACIA5Pcg0AA0AgCCAFKAIQIAUoAhQgCRApQQF0aiIALQAAIQMgBUEQaiAALQABECYgAiADOgAAIAVBEGoQIyEAIAJBAWoiAiAOTw0BIABFDQALCyACIA5JBEADQCAIIAUoAhAgBSgCFCAJEClBAXRqIgAtAAAhAyAFQRBqIAAtAAEQJiACIAM6AAAgAkEBaiICIA5HDQALCyABQWwgBSgCXCAFKAJgIAUoAmQQSyAFKAJEIAUoAkggBSgCTBBLcSAFKAIsIAUoAjAgBSgCNBBLcSAFKAIUIAUoAhggBSgCHBBLcRshBgsgBUHwAGokACAGC7YUAQ1/IwBB8ABrIgUkAEFsIQYCQCADQQpJDQAgAi8AACELIAIvAAIhCSACLwAEIQwgBUEIaiAEKAIAEDQgAyAMIAkgC2pqQQZqIgdJDQAgBS0ACiEIIAVB2ABqIAJBBmoiAiALEEUiBhAhDQAgBUFAayACIAtqIgIgCRBFIgYQIQ0AIAVBKGogAiAJaiICIAwQRSIGECENACAFQRBqIAIgDGogAyAHaxBFIgYQIQ0AIARBBGohByAAIAFBA2pBAnYiAmoiCSACaiIMIAJqIgsgACABaiIRQX1qIg9JIQ0gBUHYAGoQIyECIAVBQGsQIyEDIAVBKGoQIyEEAkAgBUEQahAjIAIgA3IgBHJyIAsgD09yRQRAIAkhAiAMIQQgCyEDA0AgACAHIAUoAlggBSgCXCAIEClBAnRqIgYvAQA7AAAgBUHYAGogBi0AAhAmIAYtAAMhDSACIAcgBSgCQCAFKAJEIAgQKUECdGoiBi8BADsAACAFQUBrIAYtAAIQJiAGLQADIQogBCAHIAUoAiggBSgCLCAIEClBAnRqIgYvAQA7AAAgBUEoaiAGLQACECYgBi0AAyEOIAMgByAFKAIQIAUoAhQgCBApQQJ0aiIGLwEAOwAAIAVBEGogBi0AAhAmIAYtAAMhBiAAIA1qIg0gByAFKAJYIAUoAlwgCBApQQJ0aiIALwEAOwAAIAVB2ABqIAAtAAIQJiAALQADIRAgAiAKaiICIAcgBSgCQCAFKAJEIAgQKUECdGoiAC8BADsAACAFQUBrIAAtAAIQJiAALQADIQogBCAOaiIEIAcgBSgCKCAFKAIsIAgQKUECdGoiAC8BADsAACAFQShqIAAtAAIQJiAALQADIQ4gAyAGaiIGIAcgBSgCECAFKAIUIAgQKUECdGoiAy8BADsAACAFQRBqIAMtAAIQJiANIBBqIQAgAiAKaiECIAQgDmohBCAGIAMtAANqIgMgD0khDSAFQdgAahAjIQYgBUFAaxAjIQogBUEoahAjIQ4gBUEQahAjIRAgAyAPTw0CIAYgCnIgDnIgEHJFDQALDAELIAshAyAMIQQgCSECCyAEIAtLBEBBbCEGDAELIAIgDEsEQEFsIQYMAQtBbCEGIAAgCUsNAAJAIAVB2ABqECMgCUF9aiIKIABNcg0AA0AgACAHIAUoAlggBSgCXCAIEClBAnRqIgYvAQA7AAAgBUHYAGogBi0AAhAmIAAgBi0AA2oiBiAHIAUoAlggBSgCXCAIEClBAnRqIgAvAQA7AAAgBUHYAGogAC0AAhAmIAYgAC0AA2ohACAFQdgAahAjDQEgACAKSQ0ACwsCQCAFQdgAahAjIAAgCUF+aiIGS3INAANAIAAgByAFKAJYIAUoAlwgCBApQQJ0aiIKLwEAOwAAIAVB2ABqIAotAAIQJiAAIAotAANqIQAgBUHYAGoQIw0BIAAgBk0NAAsLIAAgBk0EQANAIAAgByAFKAJYIAUoAlwgCBApQQJ0aiIKLwEAOwAAIAVB2ABqIAotAAIQJiAAIAotAANqIgAgBk0NAAsLAkAgACAJTw0AIAAgByAFKAJYIAUoAlwgCBApIglBAnRqIgAtAAA6AAAgAC0AA0EBRgRAIAVB2ABqIAAtAAIQJgwBCyAFKAJcQR9LDQAgBUHYAGogByAJQQJ0ai0AAhAmIAUoAlxBIUkNACAFQSA2AlwLAkAgBUFAaxAjIAxBfWoiCSACTXINAANAIAIgByAFKAJAIAUoAkQgCBApQQJ0aiIALwEAOwAAIAVBQGsgAC0AAhAmIAIgAC0AA2oiAiAHIAUoAkAgBSgCRCAIEClBAnRqIgAvAQA7AAAgBUFAayAALQACECYgAiAALQADaiECIAVBQGsQIw0BIAIgCUkNAAsLAkAgBUFAaxAjIAIgDEF+aiIAS3INAANAIAIgByAFKAJAIAUoAkQgCBApQQJ0aiIJLwEAOwAAIAVBQGsgCS0AAhAmIAIgCS0AA2ohAiAFQUBrECMNASACIABNDQALCyACIABNBEADQCACIAcgBSgCQCAFKAJEIAgQKUECdGoiCS8BADsAACAFQUBrIAktAAIQJiACIAktAANqIgIgAE0NAAsLAkAgAiAMTw0AIAIgByAFKAJAIAUoAkQgCBApIgJBAnRqIgAtAAA6AAAgAC0AA0EBRgRAIAVBQGsgAC0AAhAmDAELIAUoAkRBH0sNACAFQUBrIAcgAkECdGotAAIQJiAFKAJEQSFJDQAgBUEgNgJECwJAIAVBKGoQIyALQX1qIgIgBE1yDQADQCAEIAcgBSgCKCAFKAIsIAgQKUECdGoiAC8BADsAACAFQShqIAAtAAIQJiAEIAAtAANqIgQgByAFKAIoIAUoAiwgCBApQQJ0aiIALwEAOwAAIAVBKGogAC0AAhAmIAQgAC0AA2ohBCAFQShqECMNASAEIAJJDQALCwJAIAVBKGoQIyAEIAtBfmoiAEtyDQADQCAEIAcgBSgCKCAFKAIsIAgQKUECdGoiAi8BADsAACAFQShqIAItAAIQJiAEIAItAANqIQQgBUEoahAjDQEgBCAATQ0ACwsgBCAATQRAA0AgBCAHIAUoAiggBSgCLCAIEClBAnRqIgIvAQA7AAAgBUEoaiACLQACECYgBCACLQADaiIEIABNDQALCwJAIAQgC08NACAEIAcgBSgCKCAFKAIsIAgQKSICQQJ0aiIALQAAOgAAIAAtAANBAUYEQCAFQShqIAAtAAIQJgwBCyAFKAIsQR9LDQAgBUEoaiAHIAJBAnRqLQACECYgBSgCLEEhSQ0AIAVBIDYCLAsCQCAFQRBqECMgDUEBc3INAANAIAMgByAFKAIQIAUoAhQgCBApQQJ0aiIALwEAOwAAIAVBEGogAC0AAhAmIAMgAC0AA2oiAiAHIAUoAhAgBSgCFCAIEClBAnRqIgAvAQA7AAAgBUEQaiAALQACECYgAiAALQADaiEDIAVBEGoQIw0BIAMgD0kNAAsLAkAgBUEQahAjIAMgEUF+aiIAS3INAANAIAMgByAFKAIQIAUoAhQgCBApQQJ0aiICLwEAOwAAIAVBEGogAi0AAhAmIAMgAi0AA2ohAyAFQRBqECMNASADIABNDQALCyADIABNBEADQCADIAcgBSgCECAFKAIUIAgQKUECdGoiAi8BADsAACAFQRBqIAItAAIQJiADIAItAANqIgMgAE0NAAsLAkAgAyARTw0AIAMgByAFKAIQIAUoAhQgCBApIgJBAnRqIgAtAAA6AAAgAC0AA0EBRgRAIAVBEGogAC0AAhAmDAELIAUoAhRBH0sNACAFQRBqIAcgAkECdGotAAIQJiAFKAIUQSFJDQAgBUEgNgIUCyABQWwgBSgCXCAFKAJgIAUoAmQQSyAFKAJEIAUoAkggBSgCTBBLcSAFKAIsIAUoAjAgBSgCNBBLcSAFKAIUIAUoAhggBSgCHBBLcRshBgsgBUHwAGokACAGC48DAQR/IwBBIGsiBSQAIAUgBCgCABA0IAUtAAIhByAFQQhqIAIgAxBFIgIQIUUEQCAEQQRqIQICQCAFQQhqECMgACABaiIDQX1qIgQgAE1yDQADQCACIAUoAgggBSgCDCAHEClBAXRqIgYtAAAhCCAFQQhqIAYtAAEQJiAAIAg6AAAgAiAFKAIIIAUoAgwgBxApQQF0aiIGLQAAIQggBUEIaiAGLQABECYgACAIOgABIAVBCGoQIyEGIABBAmoiACAETw0BIAZFDQALCwJAIAVBCGoQIyAAIANPcg0AA0AgAiAFKAIIIAUoAgwgBxApQQF0aiIELQAAIQYgBUEIaiAELQABECYgACAGOgAAIAVBCGoQIyEEIABBAWoiACADTw0BIARFDQALCyAAIANJBEADQCACIAUoAgggBSgCDCAHEClBAXRqIgQtAAAhBiAFQQhqIAQtAAEQJiAAIAY6AAAgAEEBaiIAIANHDQALCyABQWwgBSgCDCAFKAIQIAUoAhQQSxshAgsgBUEgaiQAIAILwgQBDX8jAEEQayIFJAAgBUEEaiAAKAIAEDQgBS0ABCEHIANB8ARqQQBB7AAQKCEIQVQhBAJAIAdBDEsNACADQdwJaiIMIAggBUEIaiAFQQxqIAEgAhD7ASIQECFFBEAgBSgCDCINIAdLDQEgA0GoBWohBiANIQQDQCAEIgJBf2ohBCAIIAJBAnRqKAIARQ0AC0EBIQFBACEEIAJBAWoiCkECTwRAA0AgCCABQQJ0IgtqKAIAIQ4gBiALaiAJNgIAIAkgDmohCSABIAJHIQsgAUEBaiEBIAsNAAsLIANB3AVqIQsgBiAJNgIAIAUoAggiAQRAA0AgBiAEIAxqLQAAIg5BAnRqIg8gDygCACIPQQFqNgIAIAsgD0EBdGoiDyAOOgABIA8gBDoAACAEQQFqIgQgAUcNAAsLQQAhASADQQA2AqgFIApBAk8EQCANQX9zIAdqIQZBASEEA0AgCCAEQQJ0IgxqKAIAIQ4gAyAMaiABNgIAIA4gBCAGanQgAWohASACIARHIQwgBEEBaiEEIAwNAAsLIA1BAWoiDSACayIBIAcgAWtBAWoiCEkEQCAKQQJJIQYDQEEBIQQgBkUEQANAIARBAnQiCiADIAFBNGxqaiADIApqKAIAIAF2NgIAIAIgBEchCiAEQQFqIQQgCg0ACwsgAUEBaiIBIAhJDQALCyAAQQRqIAcgCyAJIANBpAVqIAMgAiANEJYDIAVBAToABSAFIAc6AAYgACAFKAIENgIACyAQIQQLIAVBEGokACAEC+ACAQl/IwBBEGsiBCQAIARBADYCDCAEQQA2AggCQCADQUBrIgkgAyAEQQhqIARBDGogASACEPsBIggQIQ0AIARBBGogACgCABA0QQEhASAEKAIMIgUgBC0ABEEBak0EQEEAIQIgBEEAOgAFIAQgBToABiAAIAQoAgQ2AgAgBUEBakEBSwRAA0AgAyABQQJ0aiIGKAIAIQcgBiACNgIAIAcgAUF/anQgAmohAiABIAVGIQYgAUEBaiEBIAZFDQALCyAEKAIIIgdFDQEgAEEEaiEKIAVBAWohC0EAIQADQCADIAAgCWotAAAiBUECdGoiBigCACIBIAFBASAFdEEBdSIMaiICSQRAIAsgBWshBQNAIAogAUEBdGoiAiAFOgABIAIgADoAACABQQFqIgEgBigCACAMaiICSQ0ACwsgBiACNgIAIABBAWoiACAHRw0ACwwBC0FUIQgLIARBEGokACAICxQAIAAoAABBgPqerQNsQSAgAWt2CygAAkACQAJAIAAoAowBQX9qDgIAAQILIAAgARDCAw8LIAAgARDHAwsLOgEBfyABIAAoAgRrIgEgACgCGCICQYAIaksEQCAAIAEgASACa0GAeGoiAEGABCAAQYAESRtrNgIYCwsVACAAEJEBBEAgACgCBA8LIAAtAAsLRQEBfwJAIAIgA00gACABTXINAANAIABBf2oiAC0AACACQX9qIgItAABHDQEgBEEBaiEEIAIgA00NASAAIAFLDQALCyAECwwAIABBICABa62IpwsQACAAIAEgAigCCHRBA3RqCxIAIABBwAAgAWutiKdBACABGwsvAEEgIAFrIgEgAkkEQCAAp0F/IAJ0QX9zcQ8LIAAgASACa62Ip0F/IAJ0QX9zcQsgACACrSAAIAGtQgp8IAN+fULjyJW9y5vvjU9+fEIK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nn9+QuPcypX8zvL1hX98IQYgBCIDIgFBCGoiBCACTQ0ACwsCQCADQQRqIgEgAksEQCADIQEMAQsgAygAAK1Ch5Wvr5i23puef34gBoVCF4lCz9bTvtLHq9lCfkL5893xmfaZqxZ8IQYLIAEgAkkEQCAAIAVqQShqIQADQCABMQAAQsXP2bLx5brqJ34gBoVCC4lCh5Wvr5i23puef34hBiABQQFqIgEgAEcNAAsLIAZCIYggBoVCz9bTvtLHq9lCfiIGQh2IIAaFQvnz3fGZ9pmrFn4iBkIgiCAGhQv4AgICfwR+IAAgACkDACACrXw3AwACQAJAIAAoAkgiAyACakEfTQRAIAAgA2pBKGogASACEKsBIAAoAkggAmohAQwBCyABIAJqIQQCQAJ/IAMEQCAAQShqIgIgA2ogAUEgIANrEKsBIAAgACkDCCACKQAAEE43AwggACAAKQMQIAApADAQTjcDECAAIAApAxggACkAOBBONwMYIAAgACkDICAAQUBrKQAAEE43AyAgACgCSCECIABBADYCSCABIAJrQSBqIQELIAFBIGogBEsLBEAgASECDAELIARBYGohAyAAKQMgIQUgACkDGCEGIAApAxAhByAAKQMIIQgDQCAIIAEpAAAQTiEIIAcgASkACBBOIQcgBiABKQAQEE4hBiAFIAEpABgQTiEFIAFBIGoiAiEBIAIgA00NAAsgACAFNwMgIAAgBjcDGCAAIAc3AxAgACAINwMICyACIARPDQEgAEEoaiACIAQgAmsiARCrAQsgACABNgJICwtlACAAQgA3AyggAEL56tDQ58mh5OEANwMgIABCADcDGCAAQs/W077Sx6vZQjcDECAAQtbrgu7q/Yn14AA3AwggAEIANwMAIABCADcDMCAAQgA3AzggAEFAa0IANwMAIABCADcDSAsVACABBEAgAiAAIAERAwAPCyAAEEwLYQEDf0F+IQECQCAARQ0AIAAoAhwiAkUNACAAKAIkIgNFDQAgAigCNCIBBEAgACgCKCABIAMRBAAgACgCJCEDIAAoAhwhAgsgACgCKCACIAMRBABBACEBIABBADYCHAsgAQudCwEMfyACQQBOBEBBBEEDIAEvAQIiCxshB0EHQYoBIAsbIQQgAEG5LWohCEF/IQYDQCALIQkCQCAJIAEgDCINQQFqIgxBAnRqLwECIgtH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AhQgCiAAKAIIaiADOgAAIAAgACgCFCIDQQFqNgIUIAMgACgCCGogAEG5LWotAAA6AAAgACABQRAgACgCvC0iAWt2OwG4LSAAIAEgAmpBcGo2ArwtDwsgACACIARqNgK8LQuXAQECfwJAAn8gACgCvC0iAUEJTgRAIAAgACgCFCIBQQFqNgIUIAEgACgCCGogAC0AuC06AAAgACAAKAIUIgFBAWo2AhQgAEG5LWotAAAhAiABIAAoAghqDAELIAFBAUgNASAAIAAoAhQiAUEBajYCFCAALQC4LSECIAEgACgCCGoLIAI6AAALIABBADYCvC0gAEEAOwG4LQvaBAEBfwNAIAAgAUECdGpBADsBlAEgAUEBaiIBQZ4CRw0ACyAAQQA7AfwUIABBADsBiBMgAEHEFWpBADsBACAAQcAVakEAOwEAIABBvBVqQQA7AQAgAEG4FWpBADsBACAAQbQVakEAOwEAIABBsBVqQQA7AQAgAEGsFWpBADsBACAAQagVakEAOwEAIABBpBVqQQA7AQAgAEGgFWpBADsBACAAQZwVakEAOwEAIABBmBVqQQA7AQAgAEGUFWpBADsBACAAQZAVakEAOwEAIABBjBVqQQA7AQAgAEGIFWpBADsBACAAQYQVakEAOwEAIABBgBVqQQA7AQAgAEH8E2pBADsBACAAQfgTakEAOwEAIABB9BNqQQA7AQAgAEHwE2pBADsBACAAQewTakEAOwEAIABB6BNqQQA7AQAgAEHkE2pBADsBACAAQeATakEAOwEAIABB3BNqQQA7AQAgAEHYE2pBADsBACAAQdQTakEAOwEAIABB0BNqQQA7AQAgAEHME2pBADsBACAAQcgTakEAOwEAIABBxBNqQQA7AQAgAEHAE2pBADsBACAAQbwTakEAOwEAIABBuBNqQQA7AQAgAEG0E2pBADsBACAAQbATakEAOwEAIABBrBNqQQA7AQAgAEGoE2pBADsBACAAQaQTakEAOwEAIABBoBNqQQA7AQAgAEGcE2pBADsBACAAQZgTakEAOwEAIABBlBNqQQA7AQAgAEGQE2pBADsBACAAQYwTakEAOwEAIABCADcCrC0gAEGUCWpBATsBACAAQQA2AqgtIABBADYCoC0LngEBAn8gACAALwG4LSADQf//A3EiBCAAKAK8LSIDdHIiBTsBuC0gAAJ/IANB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A0AgCSAFIARBAXRqIgotAAEiC0ECdGoiDCgCACEDIAlBPGogCi0AAEEIdCAIakH//wNxEC8gCUECOgA/IAkgByALayIKIAJqOgA+IANBASABIAprdGohCiAJKAI8IQsDQCAAIANBAnRqIAs2AQAgA0EBaiIDIApJDQALIAwgCjYCACAEQQFqIgQgBkcNAAsLIAlBQGskAAvdAgEJfyMAQdAAayIJJAAgCUFAayAFKAIwNgIAIAkgBSkCKDcDOCAJIAUpAiA3AzAgCSAFKQIYNwMoIAkgBSkCEDcDICAJIAUpAgA3AxAgCSAFKQIINwMYIAMEQCAHIAZrIQ8gByABayEQA0BBASABIAcgAiALQQF0aiIGLQABIgxrIghrIgp0IQ0gBi0AACEOIAlBEGogDEECdGoiDCgCACEGAkAgCiAPTwRAIAAgBkECdGogCiAIIAUgCEE0bGogCCAQaiIIQQEgCEEBShsiCCACIAQgCEECdGooAgAiCEEBdGogAyAIayAHIA4QlQMgBiANaiEIDAELIAlBDGogDhAvIAlBAToADyAJIAg6AA4gBiAGIA1qIghPDQAgCSgCDCEKA0AgACAGQQJ0aiAKNgEAIAZBAWoiBiAIRw0ACwsgDCAINgIAIAtBAWoiCyADRw0ACwsgCUHQAGokAAs+AQN/IAAEQCAAKAIAIABBvNABaigCACIBIABBwNABaigCACICIABBxNABaigCACIDEGQgACABIAIgAxBkCwvMAQEBfyAAIAEoArTQATYCmOIBIAAgASgCBCICNgLA4AEgACACNgK84AEgACACIAEoAghqIgI2ArjgASAAIAI2AsTgASABKAK40AEEQCAAQoGAgIAQNwOI4QEgACABQaTQAGo2AgwgACABQZQgajYCCCAAIAFBnDBqNgIEIAAgAUEMajYCACAAQazQAWogAUGo0AFqKAIANgIAIABBsNABaiABQazQAWooAgA2AgAgAEG00AFqIAFBsNABaigCADYCAA8LIABCADcDiOEBC6JIAS5/IwBB4ABrIhIkACAAKAKEASEGIAAoAgQhByAAKAKIASEFIAAoAgwhCCASIAAoAhg2AlwgACgCPCEbIABBQGsoAgAhHCAAQSxqIiYgAyAEQQIQWSADIAcgCGogA0ZqIg0gAyAEaiIMQXhqIi5JBEAgBUH/HyAFQf8fSRsh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AnRBsKcBaigCABBHIAtBOGoQOSALQThqIAAvAQYgAi0AAEECdEGQpAFqKAIAEEcgC0E4ahA5AkAgCgRAIAEtAAAiASABQRggAUEYSRsiAmsiAQRAIAtBOGogACgCACABEEcgC0E4ahA5CyALQThqIAAoAgAgAXYgAhBHDAELIAtBOGogACgCACABLQAAEEcLIAtBOGoQOSAJQQJPBEAgCUF+aiEMA0AgByAMai0AACECIAMgDGotAAAhBCALQThqIAtBGGogBSAMai0AACIAEGwgC0E4aiALQShqIAQQbCALQThqEDkgC0E4aiALQQhqIAIQbCALQThqEDkgC0E4aiAIIAxBA3RqIgEvAQQgAkECdEGwpwFqKAIAIgIQRyACIARBAnRBkKQBaigCACICakEZTwRAIAtBOGoQOQsgC0E4aiABLwEGIAIQRyALQThqEDkCQCAKBEAgACAAQRggAEEYSRsiAmsiAARAIAtBOGogASgCACAAEEcgC0E4ahA5CyALQThqIAEoAgAgAHYgAhBHDAELIAtBOGogASgCACAAEEcLIAtBOGoQOSAMQX9qIgwgCUkNAAsLIAtBOGogCygCKCALKAI0EHQgC0E4aiALKAIYIAsoAiQQdCALQThqIAsoAgggCygCFBB0IAtBOGoQ/QEiAEG6fyAAGyEMCyALQdAAaiQAIAwLLwAgACACQQN0aigCBCIAQRB2QQFqIgJBCHRBfyABdCAAayACQRB0akEIdCABdmsLTwEEfwNAIANBASAAIARBAnRqKAIAIgNBCHQiBSACbiIGIAUgAkkbIAYgAxtBAnRBkJwBaigCACADbGohAyAEQQFqIgQgAU0NAAsgA0EIdgtKAQF/IwBB8ARrIgQkACAEIAMgAiABEKcBIgMgACACIAEQpgEiAhAhRQRAIARB8ABqQYAEIAQgASADEKgBIQILIARB8ARqJAAgAguKAQEIfyMAQRBrIgMkACADIAAQc0F/IQUCQCAALwACIAJJDQAgAygCDCIHQQh0QYACaiEIIAMoAgghCUEAIQADQCAJIAcgABDJAyEGIAEgAEECdGooAgAiCgRAIAYgCE8NAiAGIApsIARqIQQLIABBAWoiACACTQ0ACyAEQQh2IQULIANBEGokACAFC18BAn9BCCABayEFQQAhAQNAIARBASAAIAFBAXRqLwEAIgQg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ASACEEUiARAhDQEgBEEQaiAEQRhqIAMQggEgBEEIaiAEQRhqIAMQggFBACEBAkAgBEEYahAjBEBBACEDDAELA0AgACABaiICIARBEGogBEEYahBiOgAAIAIgBEEIaiAEQRhqEGI6AAEgBEEYahAjBEAgAUECciEDDAILIAIgBEEQaiAEQRhqEGI6AAIgAiAEQQhqIARBGGoQYjoAAyABQQRqIQMgBEEYahAjIQIgAUH3AUsNASADIQEgAkUNAAsLAn8DQEG6fyEBIANB/QFLDQMgACADaiICIARBEGogBEEYahBiOgAAIAIiBkEBaiEFIARBGGoQI0EDRgRAQQIhAyAEQQhqDAILIANB/AFLDQMgBiAEQQhqIARBGGoQYjoAASADQQJqIQMgBEEYahAjQQNHDQALIAAgA2ohBUEDIQMgBEEQagshASAFIAEgBEEYahBiOgAAIAIgA2ogAGshAQwBCyAEQRhqIAEgAhBFIgEQIQ0AIARBEGogBEEYaiADEIIBIARBCGogBEEYaiADEIIBQQAhAQJAIARBGGoQIwRAQQAhAwwBCwNAIAAgAWoiAiAEQRBqIARBGGoQYToAACACIARBCGogBEEYahBhOgABIARBGGoQIwRAIAFBAnIhAwwCCyACIARBEGogBEEYahBhOgACIAIgBEEIaiAEQRhqEGE6AAMgAUEEaiEDIARBGGoQIyECIAFB9wFLDQEgAyEBIAJFDQALCwJ/A0BBun8hASADQf0BSw0CIAAgA2oiAiAEQRBqIARBGGoQYToAACACIgZBAWohBSAEQRhqECNBA0YEQEECIQMgBEEIagwCCyADQfwBSw0CIAYgBEEIaiAEQRhqEGE6AAEgA0ECaiEDIARBGGoQI0EDRw0ACyAAIANqIQVBAyEDIARBEGoLIQEgBSABIARBGGoQYToAACACIANqIABrIQELIARBMGokACABC68DAQp/IwBBgARrIgkkAEFSIQUCQCACQf8BSw0AIABBBGohCkGAgAQgA0F/anRBEHUhC0EBIAN0IghBf2oiDCEHQQEhBQNAAkAgASAEQQF0Ig1qLwEAIgZB//8DRgRAIAogB0ECdGogBDoAAiAHQX9qIQdBASEGDAELIAVBACALIAZBEHRBEHVKGyEFCyAJIA1qIAY7AQAgAiAERyEGIARBAWohBCAGDQALIAAgBTsB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IAIgASgCCGpBADoAACABIAEoAhQiAkEBajYCFCACIAEoAghqQQA6AABBAiECIAEoAoQBIgNBCUcEQEEEIAEoAogBQQFKQQJ0IANBAkgbIQILIAEgASgCFCIDQQFqNgIUIAMgASgCCGogAjoAACABIAEoAhQiAkEBajYCFCACIAEoAghqQQM6AAAgAUHxADYCBAwNCyACKAIkIQMgAigCHCEEIAIoAhAhBSACKAIsIQYgAigCACEHIAEgASgCFCIIQQFqNgIUQQIhAiAIIAEoAghqIAZBAEdBAXQgB0EAR3IgBUEAR0ECdHIgBEEAR0EDdHIgA0EAR0EEdHI6AAAgASgCHCgCBCEDIAEgASgCFCIEQQFqNgIUIAQgASgCCGogAzoAACABKAIcKAIEIQMgASABKAIUIgRBAWo2AhQgBCABKAIIaiADQQh2OgAAIAEoAhwvAQYhAyABIAEoAhQiBEEBajYCFCAEIAEoAghqIAM6AAAgASgCHC0AByEDIAEgASgCFCIEQQFqNgIUIAQgASgCCGogAzoAACABKAKEASIDQQlHBEBBBCABKAKIAUEBSkECdCADQQJIGyECCyABIAEoAhQiA0EBajYCFCADIAEoAghqIAI6AAAgASgCHCgCDCECIAEgASgCFCIDQQFqNgIUIAMgASgCCGogAjoAAAJ/IAEoAhwiBCgCEARAIAQoAhQhAiABIAEoAhQiA0EBajYCFCADIAEoAghqIAI6AAAgASgCHCgCFCECIAEgASgCFCIDQQFqNgIUIAMgASgCCGogAkEIdjoAACABKAIcIQQLIAQoAiwLBEAgACAAKAIwIAEoAgggASgCFBA1NgIwCyABQcUANgIEIAFBADYCIAwCCyABKAIwQQx0QYCQfmohBEEAIQICQCABKAKIAUEBSg0AIAEoAoQBIgNBAkgNAEHAACECIANBBkgNAEGAAUHAASADQQZGGyECCyABQfEANgIEIAEgAiAEciICQSByIAIgASgCbBsiAkEfcCACckEfcxB1IAEoAmwEQCABIAAvATIQdSABIAAvATAQdQsgAEEAQQBBABBlNgIwIAEoAgQhAgsgAkHFAEcNASABKAIcIQQLAkAgBCgCEARAIAEoAhQhAiABKAIgIgUgBC8BFE8NASACIQMDQCABKAIMIAJGBEACQCACIANNDQAgBCgCLEUNACAAIAAoAjAgASgCCCADaiACIANrEDU2AjALIAAQNiABKAIcIQQgASgCFCICIAEoAgxGDQMgASgCICEFIAIhAwsgBCgCECAFai0AACEEIAEgAkEBajYCFCABKAIIIAJqIAQ6AAAgASABKAIgQQFqIgU2AiAgBSABKAIcIgQvARRPBEAgAyECDAMFIAEoAhQhAgwBCwALAAsgAUHJADYCBAwCCwJAIAQoAixFDQAgASgCFCIDIAJNDQAgACAAKAIwIAEoAgggAmogAyACaxA1NgIwCyABKAIgIAQoAhRGBEAgAUHJADYCBCABQQA2AiAMAgsgASgCBCECCyACQckARw0BIAEoAhwhBAsgBCgCHEUNAiABKAIUIgIhAwJAA0ACQCABKAIMIAJGBEACQCACIANNDQAgASgCHCgCLEUNACAAIAAoAjAgASgCCCADaiACIANrEDU2AjALIAAQNiABKAIUIgIgASgCDEYNASACIQMLQQEhBSABKAIcKAIcIQQgASABKAIgIgZBAWo2AiAgBCAGai0AACEEIAEgAkEBajYCFCABKAIIIAJqIAQ6AAAgBARAIAEoAhQhAgwCBSADIQIMAwsACwtBACEFCwJAIAEoAhwiBCgCLEUNACABKAIUIgMgAk0NACAAIAAoAjAgASgCCCACaiADIAJrEDU2AjALIAUNASABKAIEIQILIAJB2wBHDQMgASgCHCEEDAILIAFBADYCIAsgAUHbADYCBAsgBCgCJEUNASABKAIUIgIhAwJAA0ACQCABKAIMIAJGBEACQCACIANNDQAgASgCHCgCLEUNACAAIAAoAjAgASgCCCADaiACIANrEDU2AjALIAAQNiABKAIUIgIgASgCDEYNASACIQMLQQEhBSABKAIcKAIkIQQgASABKAIgIgZBAWo2AiAgBCAGai0AACEEIAEgAkEBajYCFCABKAIIIAJqIAQ6AAAgBARAIAEoAhQhAgwCBSADIQIMAwsACwtBACEFCwJAIAEoAhwiBCgCLEUNACABKAIUIgMgAk0NACAAIAAoAjAgASgCCCACaiADIAJrEDU2AjALIAUNASABKAIEIQILIAJB5wBHDQIgASgCHCEEDAELIAFB5wA2AgQLIAQoAiwEQCABKAIUIgVBAmoiAiABKAIMIgRLBH8gABA2IAEoAgwhBCABKAIUIgVBAmoFIAILIARLDQEgACgCMCECIAEgBUEBajYCFCABKAIIIAVqIAI6AAAgACgCMCECIAEgASgCFCIDQQFqNgIUIAMgASgCCGogAkEIdjoAACAAQQBBAEEAEDU2AjAgAUHxADYCBAwBCyABQfEANgIECwJAIAEoAhQEQCAAEDYgACgCEARAIAAoAgQhAgwCCwwECyAAKAIEIgINAEEAIQILAkACQAJAIAEoAgQiA0GaBUYEQCACRQ0BDAULIAINAQsgA0GaBUcNACABKAJ0RQ0BCwJ/AkACQAJAIAEoAogBQX5qDgIAAQILIAEQnQQMAgsgARCcBAwBCyABQQQgASgChAFBDGxBuNcAaigCABEDAAsiAkF+cUECRgRAIAFBmgU2AgQLIAJBfXFFBEBBACECIAAoAhANAgwECyACQQFHDQAgAUEAQQBBABCOAiAAEDYgACgCEA0ADAMLQQEhAiABKAIYIgNBAUgNACAAKAIwIQICQCADQQJGBEAgASABKAIUIgNBAWo2AhQgAyABKAIIaiACOgAAIAAoAjAhAiABIAEoAhQiA0EBajYCFCADIAEoAghqIAJBCHY6AAAgAC8BMiECIAEgASgCFCIDQQFqNgIUIAMgASgCCGogAjoAACAALQAzIQIgASABKAIUIgNBAWo2AhQgAyABKAIIaiACOgAAIAAoAgghAiABIAEoAhQiA0EBajYCFCADIAEoAghqIAI6AAAgACgCCCECIAEgASgCFCIDQQFqNgIUIAMgASgCCGogAkEIdjoAACAALwEKIQIgASABKAIUIgNBAWo2AhQgAyABKAIIaiACOgAAIAAtAAshAiABIAEoAhQiA0EBajYCFCADIAEoAghqIAI6AAAMAQsgASACQRB2EHUgASAALwEwEHULIAAQNiABKAIYIgBBAU4EQCABQQAgAGs2AhgLIAEoAhRFIQILIAIPCyAAQceEATYCGEF7DwsgAUF/NgIoQQAL3QEBBn8CQCAAKAKAgBAiBSAAKAKEgBAiAyAAKAKMgBAiBGpBBGpJDQAgACgClIAQIgIgBSADa0F9aiIGTw0AA0AgACACQf//A3FBAXRqQYCACGogAiAAIAIgA2oQOkECdGoiBCgCAGsiB0H//wMgB0H//wNJGzsBACAEIAI2AgAgAkEBaiICIAZJDQALIAAoAoyAECEECyAAIAQ2ApCAECAAIAM2AoiAECAAQQA2ApyAECAAIAE2AoCAECAAIAUgA2siAjYCjIAQIAAgAjYClIAQIAAgASACazYChIAQC9kDAQR/IwBBEGsiAyQAIAFBADYCACAAKAIAIgIgA0EMaiACKAIAKAIMEQMAIQICQCADKAIMRQ0AIAIsAAAhAiAAKAIAIgRBASAEKAIAKAIQEQQAIAEgASgCACACQf8AcXI2AgACQCACQX9KDQAgACgCACICIANBDGogAigCACgCDBEDACECIAMoAgxFDQEgAiwAACECIAAoAgAiBEEBIAQoAgAoAhARBAAgASABKAIAIAJB/wBxQQd0cjYCACACQX9KDQAgACgCACICIANBDGogAigCACgCDBEDACECIAMoAgxFDQEgAiwAACECIAAoAgAiBEEBIAQoAgAoAhARBAAgASABKAIAIAJB/wBxQQ50cjYCACACQX9KDQAgACgCACICIANBDGogAigCACgCDBEDACECIAMoAgxFDQEgAiwAACECIAAoAgAiBEEBIAQoAgAoAhARBAAgASABKAIAIAJB/wBxQRV0cjYCACACQX9KDQAgACgCACICIANBDGogAigCACgCDBEDACECIAMoAgxFDQEgAiwAACEFIAAoAgAiAEEBIAAoAgAoAhARBAAgASABKAIAIAVBHHRyNgIAIAVBf0oNAEEAIQUMAQtBASEFCyADQRBqJAAgBQvhSQE3fwJAIAAoAoCAECIJIAAoAoSAECILayAAKAKQgBBrIghBgIAETwRAIABBADYCnIAQDAELAkAgCA0AIAMoAgBBgSBIDQAgACAAKAKcgBBBoIAQECoiACABEKwEIAAgBTsBmIAQDAELAkAgBEEATEEAIAZBAkYbDQAgAygCACIIQYCAgPAHSw0AIAAgCCAJajYCgIAQQQkgBSAFQQFIGyIFQQwgBUEMSBsiG0EMbCIJQZQWaigCACEuAkACfyAbQQlNBEAgA0EANgIAIAIgBGoiOkF7aiA6IAZBAkYiOxshKSABIAhqITMgASEoIAIhCQJAIAhBDUgNACAzQXRqIjIgAUkNAEGANCAbdkEBcSE0IDNBe2oiGEF/aiEvIBhBfWohIkEAIRsDQCAAKAKUgBAhBCAAKAKIgBAhEyAAKAKcgBAhFCAoIQwDQCAAKAKQgBAiBSAMIAtrIh9BgYB8aiAFQYCABGogH0sbIRUgACgC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BEADQCADKAAAIAQoAABzIgkEQCAJECUgBGogAGsMBAsgA0EEaiEDIARBBGoiBCAUSQ0ACwsCQCAEIBhPDQAgAy8AACAELwAARw0AIANBAmohAyAEQQJqIQQLIAQgF0kEfyAEQQFqIAQgAy0AACAELQAARhsFIAQLIABrDAELIAMQJQsiAEHwAWpB/wFuakEIaiAPSw0EIAdBAmohAyAAIAZqQQRqIQYgBS0AACEEAn8gAEEPTwRAIAUgBEEPajoAACADQX8QNCAAQXFqIgRB/AdPBEADQCADQQRqIgNBfxA0IARBhHhqIgRB+wdLDQALCyADIARB//8DcUH/AW4iAGoiAyAAQYF+bCAEajoAACADQQFqDAELIAUgACAEajoAACADCyEFIAYgEU8NASAGQX5qIgAgACgAACALEDAgCCALIAwQSSAGKAAAIQACQAJAIBZFBEAgAEEBEDAiACAIEIUBIQQgBiAAIAhBASAMEEkgBEH//wNqIAZJDQEgBCgAACAGKAAARw0BDAILIAAgCxAwIgMgCCALEEghACAGIAxrIgQgAyAIIAsQXCAAQf//A2ogBEkNACAAIAxqIgQoAAAgBigAAEYNAQsgBkEBaiIDKAAAIAsQMCEEDAMLIAVBADoAACAFQQFqIQcMAAsACwtBACETIAUgECAGayIBaiABQfABakH/AW5qQQFqIA9LDQECQCABQQ9PBEAgBUHwAToAACAFQQFqIQAgAUFxaiIDQf8BSQRAIAAiBSADOgAADAILIABB/wEgAUHyfWoiAEH/AW5BAWoQKBogAEH/AW4iAyAFakECaiIFIANBgX5sIABqOgAADAELIAUgAUEEdDoAAAsgBUEBaiAGIAEQKiABaiACayETDAELIANBgICA8AdLDQAgASADaiIPQXVqIRAgD0F0aiEUIAgoAoCAASEAIAhBAUECIAFB//8DSxsiCzsBhoABIAggACADajYCgIABIAggCCgCkIABIANqNgKQgAEgASABKAAAIAsQMCAIIAsgASAAayIMEEkgD0F7aiITQX9qIRcgE0F9aiERIAZBBnQiCkEBciENIAFBAWoiAygAACALEDAhBCABQYCABEkhFSACIQUgASEGA0ACQCAVRQRAIAMgFEsNBCADQQFqIQ4gCiEJIA0hBwNAIAQgCBCFASEAIA4oAABBARAwIRIgAyAE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IAJBCE8EQANAIAMEQCADIAVsIQcgBUEHciIIIANsIQkgBUEGciIKIANsIQsgBUEFciIMIANsIQ0gBUEEciIOIANsIQ8gBUEDciIQIANsIREgBUECciISIANsIRMgBUEBciIUIANsIRVBACEEA0AgASAFIAIgBGwiBmpqIAAgBCAHamotAAA6AAAgASAGIBRqaiAAIAQgFWpqLQAAOgAAIAEgBiASamogACAEIBNqai0AADoAACABIAYgEGpqIAAgBCARamotAAA6AAAgASAGIA5qaiAAIAQgD2pqLQAAOgAAIAEgBiAMamogACAEIA1qai0AADoAACABIAYgCmpqIAAgBCALamotAAA6AAAgASAGIAhqaiAAIAQgCWpqLQAAOgAAIARBAWoiBCADRw0ACwsgBUEPaiEEIAVBCGohBSAEIAJJDQALCyACQXhxIgUgAk8NAANAIAMEQCADIAVsIQZBACEEA0AgASACIARsIAVqaiAAIAQgBmpqLQAAOgAAIARBAWoiBCADRw0ACwsgBUEBaiIFIAJHDQALCyACIANsrQuCAQEGfyABIAEgAG4iBiAAbGshByAAIAFNBEAgBkEBIAZBAUsbIQgDQCAABEAgACAEbCEJQQAhBQNAIAMgBSAJamogAiAFIAZsIARqai0AADoAACAFQQFqIgUgAEcNAAsLIARBAWoiBCAIRw0ACwsgAyABIAdrIgBqIAAgAmogBxAqGgsNACAAIAEgAiADEL0EC4IBAQZ/IAEgASAAbiIGIABsayEHIAAEQCAGQQEgBkEBSxshCANAIAAgAU0EQCAEIAZsIQlBACEFA0AgAyAFIAlqaiACIAAgBWwgBGpqLQAAOgAAIAVBAWoiBSAIRw0ACwsgBEEBaiIEIABHDQALCyADIAEgB2siAGogACACaiAHECoaC7gBAQN/AkAgAUEBSA0AIAAsAAAiBEH/AHEhAwJAIARBf0oNACABQQJIDQEgACwAASIEQQd0QYD/AHEgA3IhAyAEQX9KDQAgAUEDSA0BIAAsAAIiBEEOdEGAgP8AcSADciEDIARBf0oNACABQQRIDQEgACwAAyIEQRV0QYCAgP8AcSADciEDIARBf0oNACABQQVIDQEgAC0ABCIAQQ9LDQEgAEEcdCADciEDCyACIAM2AgBBASEFCyAFCw0AIAAgASACIAMQvwQLlAIB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CA0tEC0gLgAJDS4QLiAvAAoNLxAvIDAACw0wEDAgMQAEDjEQMSAyAAUOMhAyIDMABg4zEDMgNAAHDjQQNCA1AAgONRA1IDYACQ42EDYgNwAKDjcQNyA4AAsOOBA4IDkABA85EDkgOgAFDzoQOiA7AAYPOxA7IDwABw88EDwgAQgIDz0QPSABEAkPPhA+IAEYCg8/ED8gASALD0AQQCAAAAAA/wAAAP//AAD///8A/////2RlY29tcHJlc3MAY29tcHJlc3MAZnJlZV9yZXN1bHQAdmkAAHhzAABpaWlpaWlpAEGQDgvUBigHAAAwBwAAMAcAAMxzAADMcwAAzHMAABh0AAC2BwAAQHQAAEgHAAAAAAAAAQAAAIgHAAAAAAAATlN0M19fMjEyYmFzaWNfc3RyaW5nSWNOU18xMWNoYXJfdHJhaXRzSWNFRU5TXzlhbGxvY2F0b3JJY0VFRUUAABh0AACQBwAATlN0M19fMjIxX19iYXNpY19zdHJpbmdfY29tbW9uSUxiMUVFRQBOMTBlbXNjcmlwdGVuM3ZhbEUAAAAAGHQAANQHAABOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0loRUUAaWlpAAAoBwAAMAcAABgIAAAgCAAAJAgAACoIAAAxCAAANggAAGJsb3NjbHoAbHo0AGx6NGhjAHNuYXBweQB6bGliAHpzdGQARXJyb3IuICBudGhyZWFkcyBjYW5ub3QgYmUgbGFyZ2VyIHRoYW4gQkxPU0NfTUFYX1RIUkVBRFMgKCVkKQBFcnJvci4gIG50aHJlYWRzIG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyAEVSUk9SOyByZXR1cm4gY29kZSBmcm9tIHB0aHJlYWRfY3JlYXRlKCkgaXMgJWQKAAlFcnJvciBkZXRhaWw6ICVzCgBCbG9zYyBoYXMgbm90IGJlZW4gY29tcGlsZWQgd2l0aCAnJXMnIABjb21wcmVzc2lvbiBzdXBwb3J0LiAgUGxlYXNlIHVzZSBvbmUgaGF2aW5nIGl0LgBFcnJvciBhbGxvY2F0aW5nIG1lbW9yeSEARVJST1I7IHJldHVybiBjb2RlIGZyb20gcHRocmVhZF9qb2luKCkgaXMgJWQKAElucHV0IGJ1ZmZlciBzaXplIGNhbm5vdCBleGNlZWQgJWQgYnl0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AAAIAAAACQAAAAkAAAAKAAAACgAAAAsAAAALAAAADAAAAAwAAAANAAAADQBBgNsAC/8IDAAIAIwACABMAAgAzAAIACwACACsAAgAbAAIAOwACAAcAAgAnAAIAFwACADcAAgAPAAIALwACAB8AAgA/AAIAAIACACCAAgAQgAIAMIACAAiAAgAogAIAGIACADiAAgAEgAIAJIACABSAAgA0gAIADIACACyAAgAcgAIAPIACAAKAAgAigAIAEoACADKAAgAKgAIAKoACABqAAgA6gAIABoACACaAAgAWgAIANoACAA6AAgAugAIAHoACAD6AAgABgAIAIYACABGAAgAxgAIACYACACmAAgAZgAIAOYACAAWAAgAlgAIAFYACADWAAgANgAIALYACAB2AAgA9gAIAA4ACACOAAgATgAIAM4ACAAuAAgArgAIAG4ACADuAAgAHgAIAJ4ACABeAAgA3gAIAD4ACAC+AAgAfgAIAP4ACAABAAgAgQAIAEEACADBAAgAIQAIAKEACABhAAgA4QAIABEACACRAAgAUQAIANEACAAxAAgAsQAIAHEACADxAAgACQAIAIkACABJAAgAyQAIACkACACpAAgAaQAIAOkACAAZAAgAmQAIAFkACADZAAgAOQAIALkACAB5AAgA+QAIAAUACACFAAgARQAIAMUACAAlAAgApQAIAGUACADlAAgAFQAIAJUACABVAAgA1QAIADUACAC1AAgAdQAIAPUACAANAAgAjQAIAE0ACADNAAgALQAIAK0ACABtAAgA7QAIAB0ACACdAAgAXQAIAN0ACAA9AAgAvQAIAH0ACAD9AAgAEwAJABMBCQCTAAkAkwEJAFMACQBTAQkA0wAJANMBCQAzAAkAMwEJALMACQCzAQkAcwAJAHMBCQDzAAkA8wEJAAsACQALAQkAiwAJAIsBCQBLAAkASwEJAMsACQDLAQkAKwAJACsBCQCrAAkAqwEJAGsACQBrAQkA6wAJAOsBCQAbAAkAGwEJAJsACQCbAQkAWwAJAFsBCQDbAAkA2wEJADsACQA7AQkAuwAJALsBCQB7AAkAewEJAPsACQD7AQkABwAJAAcBCQCHAAkAhwEJAEcACQBHAQkAxwAJAMcBCQAnAAkAJwEJAKcACQCnAQkAZwAJAGcBCQDnAAkA5wEJABcACQAXAQkAlwAJAJcBCQBXAAkAVwEJANcACQDXAQkANwAJADcBCQC3AAkAtwEJAHcACQB3AQkA9wAJAPcBCQAPAAkADwEJAI8ACQCPAQkATwAJAE8BCQDPAAkAzwEJAC8ACQAvAQkArwAJAK8BCQBvAAkAbwEJAO8ACQDvAQkAHwAJAB8BCQCfAAkAnwEJAF8ACQBfAQkA3wAJAN8BCQA/AAkAPwEJAL8ACQC/AQkAfwAJAH8BCQD/AAkA/wEJAAAABwBAAAcAIAAHAGAABwAQAAcAUAAHADAABwBwAAcACAAHAEgABwAoAAcAaAAHABgABwBYAAcAOAAHAHgABwAEAAcARAAHACQABwBkAAcAFAAHAFQABwA0AAcAdAAHAAMACACDAAgAQwAIAMMACAAjAAgAowAIAGMACADjAAgAQaDkAAtNAQAAAAEAAAABAAAAAQAAAAIAAAACAAAAAgAAAAIAAAADAAAAAwAAAAMAAAADAAAABAAAAAQAAAAEAAAABAAAAAUAAAAFAAAABQAAAAUAQYDlAAsTEBESAAgHCQYKBQsEDAMNAg4BDwBBoeUAC+wCAQIDBAUGBwgICQkKCgsLDAwMDA0NDQ0ODg4ODw8PDxAQEBAQEBAQERERERERERESEhISEhISEhMTExMTExMTFBQUFBQUFBQUFBQUFBQUFBUVFRUVFRUVFRUVFRUVFRUWFhYWFhYWFhYWFhYWFhYWFxcXFxcXFxcXFxcXFxcXFxgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxscAAAAAAEAAAACAAAAAwAAAAQAAAAFAAAABgAAAAcAAAAIAAAACgAAAAwAAAAOAAAAEAAAABQAAAAYAAAAHAAAACAAAAAoAAAAMAAAADgAAABAAAAAUAAAAGAAAABwAAAAgAAAAKAAAADAAAAA4ABBoegAC/UEAQIDBAQFBQYGBgYHBwcHCAgICAgICAgJCQkJCQkJCQoKCgoKCgoKCgoKCgoKCgoLCwsLCwsLCwsLCwsLCwsLDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PAAAQERISExMUFBQUFRUVFRYWFhYWFhYWFxcXFxcXFxcYGBgYGBgYGBgYGBgYGBgYGRkZGRkZGRkZGRkZGRkZGRoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxscHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHQAAAAABAAAAAgAAAAMAAAAEAAAABgAAAAgAAAAMAAAAEAAAABgAAAAgAAAAMAAAAEAAAABgAAAAgAAAAMAAAAAAAQAAgAEAAAACAAAAAwAAAAQAAAAGAAAACAAAAAwAAAAQAAAAGAAAACAAAAAwAAAAQAAAAGAAQaDtAAvEAwEAAgADAAQABQAHAAkADQARABkAIQAxAEEAYQCBAMEAAQGBAQECAQMBBAEGAQgBDAEQARgBIAEwAUABYAAAAAADAAQABQAGAAcACAAJAAoACwANAA8AEQATABcAGwAfACMAKwAzADsAQwBTAGMAcwCDAKMAwwDjAAIBAAAAAAAAEAAQABAAEAARABEAEgASABMAEwAUABQAFQAVABYAFgAXABcAGAAYABkAGQAaABoAGwAbABwAHAAdAB0AQABAABAAEAAQABAAEAAQABAAEAARABEAEQARABIAEgASABIAEwATABMAEwAUABQAFAAUABUAFQAVABUAEABIAE4AaW5jb3JyZWN0IGhlYWRlciBjaGVjawB1bmtub3duIGNvbXByZXNzaW9uIG1ldGhvZABpbnZhbGlkIHdpbmRvdyBzaXplAHVua25vd24gaGVhZGVyIGZsYWdzIHNldABoZWFkZXIgY3JjIG1pc21hdGNoAGludmFsaWQgYmxvY2sgdHlwZQBpbnZhbGlkIHN0b3JlZCBibG9jayBsZW5ndGhzAHRvbyBtYW55IGxlbmd0aCBvciBkaXN0YW5jZSBzeW1ib2xzAEHw8AAL4xMQABEAEgAAAAgABwAJAAYACgAFAAsABAAMAAMADQACAA4AAQAPAGludmFsaWQgY29kZSBsZW5ndGhzIHNldABpbnZhbGlkIGJpdCBsZW5ndGggcmVwZWF0AGludmFsaWQgY29kZSAtLSBtaXNzaW5nIGVuZC1vZi1ibG9jawBpbnZhbGlkIGxpdGVyYWwvbGVuZ3RocyBzZXQAaW52YWxpZCBkaXN0YW5jZXMgc2V0AGludmFsaWQgbGl0ZXJhbC9sZW5ndGggY29kZQBpbnZhbGlkIGRpc3RhbmNlIGNvZGUAaW52YWxpZCBkaXN0YW5jZSB0b28gZmFyIGJhY2sAaW5jb3JyZWN0IGRhdGEgY2hlY2sAaW5jb3JyZWN0IGxlbmd0aCBjaGVjawAAAAAAYAcAAAAIUAAACBAAFAhzABIHHwAACHAAAAgwAAAJwAAQBwoAAAhgAAAIIAAACaAAAAgAAAAIgAAACEAAAAngABAHBgAACFgAAAgYAAAJkAATBzsAAAh4AAAIOAAACdAAEQcRAAAIaAAACCgAAAmwAAAICAAACIgAAAhIAAAJ8AAQBwQAAAhUAAAIFAAVCOMAEwcrAAAIdAAACDQAAAnIABEHDQAACGQAAAgkAAAJqAAACAQAAAiEAAAIRAAACegAEAcIAAAIXAAACBwAAAmYABQHUwAACHwAAAg8AAAJ2AASBxcAAAhsAAAILAAACbgAAAgMAAAIjAAACEwAAAn4ABAHAwAACFIAAAgSABUIowATByMAAAhyAAAIMgAACcQAEQcLAAAIYgAACCIAAAmkAAAIAgAACIIAAAhCAAAJ5AAQBwcAAAhaAAAIGgAACZQAFAdDAAAIegAACDoAAAnUABIHEwAACGoAAAgqAAAJtAAACAoAAAiKAAAISgAACfQAEAcFAAAIVgAACBYAQAgAABMHMwAACHYAAAg2AAAJzAARBw8AAAhmAAAIJgAACawAAAgGAAAIhgAACEYAAAnsABAHCQAACF4AAAgeAAAJnAAUB2MAAAh+AAAIPgAACdwAEgcbAAAIbgAACC4AAAm8AAAIDgAACI4AAAhOAAAJ/ABgBwAAAAhRAAAIEQAVCIMAEgcfAAAIcQAACDEAAAnCABAHCgAACGEAAAghAAAJogAACAEAAAiBAAAIQQAACeIAEAcGAAAIWQAACBkAAAmSABMHOwAACHkAAAg5AAAJ0gARBxEAAAhpAAAIKQAACbIAAAgJAAAIiQAACEkAAAnyABAHBAAACFUAAAgVABAIAgETBysAAAh1AAAINQAACcoAEQcNAAAIZQAACCUAAAmqAAAIBQAACIUAAAhFAAAJ6gAQBwgAAAhdAAAIHQAACZoAFAdTAAAIfQAACD0AAAnaABIHFwAACG0AAAgtAAAJugAACA0AAAiNAAAITQAACfoAEAcDAAAIUwAACBMAFQjDABMHIwAACHMAAAgzAAAJxgARBwsAAAhjAAAIIwAACaYAAAgDAAAIgwAACEMAAAnmABAHBwAACFsAAAgbAAAJlgAUB0MAAAh7AAAIOwAACdYAEgcTAAAIawAACCsAAAm2AAAICwAACIsAAAhLAAAJ9gAQBwUAAAhXAAAIFwBACAAAEwczAAAIdwAACDcAAAnOABEHDwAACGcAAAgnAAAJrgAACAcAAAiHAAAIRwAACe4AEAcJAAAIXwAACB8AAAmeABQHYwAACH8AAAg/AAAJ3gASBxsAAAhvAAAILwAACb4AAAgPAAAIjwAACE8AAAn+AGAHAAAACFAAAAgQABQIcwASBx8AAAhwAAAIMAAACcEAEAcKAAAIYAAACCAAAAmhAAAIAAAACIAAAAhAAAAJ4QAQBwYAAAhYAAAIGAAACZEAEwc7AAAIeAAACDgAAAnRABEHEQAACGgAAAgoAAAJsQAACAgAAAiIAAAISAAACfEAEAcEAAAIVAAACBQAFQjjABMHKwAACHQAAAg0AAAJyQARBw0AAAhkAAAIJAAACakAAAgEAAAIhAAACEQAAAnpABAHCAAACFwAAAgcAAAJmQAUB1MAAAh8AAAIPAAACdkAEgcXAAAIbAAACCwAAAm5AAAIDAAACIwAAAhMAAAJ+QAQBwMAAAhSAAAIEgAVCKMAEwcjAAAIcgAACDIAAAnFABEHCwAACGIAAAgiAAAJpQAACAIAAAiCAAAIQgAACeUAEAcHAAAIWgAACBoAAAmVABQHQwAACHoAAAg6AAAJ1QASBxMAAAhqAAAIKgAACbUAAAgKAAAIigAACEoAAAn1ABAHBQAACFYAAAgWAEAIAAATBzMAAAh2AAAINgAACc0AEQcPAAAIZgAACCYAAAmtAAAIBgAACIYAAAhGAAAJ7QAQBwkAAAheAAAIHgAACZ0AFAdjAAAIfgAACD4AAAndABIHGwAACG4AAAguAAAJvQAACA4AAAiOAAAITgAACf0AYAcAAAAIUQAACBEAFQiDABIHHwAACHEAAAgxAAAJwwAQBwoAAAhhAAAIIQAACaMAAAgBAAAIgQAACEEAAAnjABAHBgAACFkAAAgZAAAJkwATBzsAAAh5AAAIOQAACdMAEQcRAAAIaQAACCkAAAmzAAAICQAACIkAAAhJAAAJ8wAQBwQAAAhVAAAIFQAQCAIBEwcrAAAIdQAACDUAAAnLABEHDQAACGUAAAglAAAJqwAACAUAAAiFAAAIRQAACesAEAcIAAAIXQAACB0AAAmbABQHUwAACH0AAAg9AAAJ2wASBxcAAAhtAAAILQAACbsAAAgNAAAIjQAACE0AAAn7ABAHAwAACFMAAAgTABUIwwATByMAAAhzAAAIMwAACccAEQcLAAAIYwAACCMAAAmnAAAIAwAACIMAAAhDAAAJ5wAQBwcAAAhbAAAIGwAACZcAFAdDAAAIewAACDsAAAnXABIHEwAACGsAAAgrAAAJtwAACAsAAAiLAAAISwAACfcAEAcFAAAIVwAACBcAQAgAABMHMwAACHcAAAg3AAAJzwARBw8AAAhnAAAIJwAACa8AAAgHAAAIhwAACEcAAAnvABAHCQAACF8AAAgfAAAJnwAUB2MAAAh/AAAIPwAACd8AEgcbAAAIbwAACC8AAAm/AAAIDwAACI8AAAhPAAAJ/wAQBQEAFwUBARMFEQAbBQEQEQUFABkFAQQVBUEAHQUBQBAFAwAYBQECFAUhABwFASASBQkAGgUBCBYFgQBABQAAEAUCABcFgQETBRkAGwUBGBEFBwAZBQEGFQVhAB0FAWAQBQQAGAUBAxQFMQAcBQEwEgUNABoFAQwWBcEAQAUAADEuMi44AHN0cmVhbSBlcnJvcgBpbnN1ZmZpY2llbnQgbWVtb3J5AGJ1ZmZlciBlcnJvcgBB5IQBC6EVazgHAA2yBwCc8gcAcGQIAGCuCgCwcQsAMKoMABMAAAAMAAAADQAAAAEAAAAGAAAAAQAAAAEAAAATAAAADQAAAA4AAAABAAAABwAAAAAAAAABAAAAFAAAAA8AAAAQAAAAAQAAAAYAAAAAAAAAAQAAABUAAAAQAAAAEQAAAAEAAAAFAAAAAAAAAAIAAAAVAAAAEgAAABIAAAABAAAABQAAAAAAAAACAAAAFQAAABIAAAATAAAAAgAAAAUAAAACAAAAAwAAABUAAAATAAAAEwAAAAMAAAAFAAAABAAAAAMAAAAVAAAAEwAAABMAAAADAAAABQAAAAgAAAAEAAAAFQAAABMAAAATAAAAAwAAAAUAAAAQAAAABQAAABUAAAATAAAAFAAAAAQAAAAFAAAAEAAAAAUAAAAWAAAAFAAAABUAAAAEAAAABQAAABAAAAAFAAAAFgAAABUAAAAWAAAABAAAAAUAAAAQAAAABQAAABYAAAAVAAAAFgAAAAUAAAAFAAAAEAAAAAUAAAAWAAAAFQAAABYAAAAFAAAABQAAACAAAAAGAAAAFgAAABYAAAAXAAAABQAAAAUAAAAgAAAABgAAABYAAAAXAAAAFwAAAAYAAAAFAAAAIAAAAAYAAAAWAAAAFgAAABYAAAAFAAAABQAAADAAAAAHAAAAFwAAABcAAAAWAAAABQAAAAQAAABAAAAABwAAABcAAAAXAAAAFgAAAAYAAAADAAAAQAAAAAgAAAAXAAAAGAAAABYAAAAHAAAAAwAAAAABAAAJAAAAGQAAABkAAAAXAAAABwAAAAMAAAAAAQAACQAAABoAAAAaAAAAGAAAAAcAAAADAAAAAAIAAAkAAAAbAAAAGwAAABkAAAAJAAAAAwAAAOcDAAAJAAAAEgAAAAwAAAANAAAAAQAAAAUAAAABAAAAAQAAABIAAAANAAAADgAAAAEAAAAGAAAAAAAAAAEAAAASAAAADgAAAA4AAAABAAAABQAAAAAAAAACAAAAEgAAABAAAAAQAAAAAQAAAAQAAAAAAAAAAgAAABIAAAAQAAAAEQAAAAIAAAAFAAAAAgAAAAMAAAASAAAAEgAAABIAAAADAAAABQAAAAIAAAADAAAAEgAAABIAAAATAAAAAwAAAAUAAAAEAAAABAAAABIAAAASAAAAEwAAAAQAAAAEAAAABAAAAAQAAAASAAAAEgAAABMAAAAEAAAABAAAAAgAAAAFAAAAEgAAABIAAAATAAAABQAAAAQAAAAIAAAABQAAABIAAAASAAAAEwAAAAYAAAAEAAAACAAAAAUAAAASAAAAEgAAABMAAAAFAAAABAAAAAwAAAAGAAAAEgAAABMAAAATAAAABwAAAAQAAAAMAAAABgAAABIAAAASAAAAEwAAAAQAAAAEAAAAEAAAAAcAAAASAAAAEgAAABMAAAAEAAAAAwAAACAAAAAHAAAAEgAAABIAAAATAAAABgAAAAMAAACAAAAABwAAABIAAAATAAAAEwAAAAYAAAADAAAAgAAAAAgAAAASAAAAEwAAABMAAAAIAAAAAwAAAAABAAAIAAAAEgAAABMAAAATAAAABgAAAAMAAACAAAAACQAAABIAAAATAAAAEwAAAAgAAAADAAAAAAEAAAkAAAASAAAAEwAAABMAAAAKAAAAAwAAAAACAAAJAAAAEgAAABMAAAATAAAADAAAAAMAAAAAAgAACQAAABIAAAATAAAAEwAAAA0AAAADAAAA5wMAAAkAAAARAAAADAAAAAwAAAABAAAABQAAAAEAAAABAAAAEQAAAAwAAAANAAAAAQAAAAYAAAAAAAAAAQAAABEAAAANAAAADwAAAAEAAAAFAAAAAAAAAAEAAAARAAAADwAAABAAAAACAAAABQAAAAAAAAACAAAAEQAAABEAAAARAAAAAgAAAAQAAAAAAAAAAgAAABEAAAAQAAAAEQAAAAMAAAAEAAAAAgAAAAMAAAARAAAAEQAAABEAAAADAAAABAAAAAQAAAAEAAAAEQAAABEAAAARAAAAAwAAAAQAAAAIAAAABQAAABEAAAARAAAAEQAAAAQAAAAEAAAACAAAAAUAAAARAAAAEQAAABEAAAAFAAAABAAAAAgAAAAFAAAAEQAAABEAAAARAAAABgAAAAQAAAAIAAAABQAAABEAAAARAAAAEQAAAAUAAAAEAAAACAAAAAYAAAARAAAAEgAAABEAAAAHAAAABAAAAAwAAAAGAAAAEQAAABIAAAARAAAAAwAAAAQAAAAMAAAABwAAABEAAAASAAAAEQAAAAQAAAADAAAAIAAAAAcAAAARAAAAEgAAABEAAAAGAAAAAwAAAAABAAAHAAAAEQAAABIAAAARAAAABgAAAAMAAACAAAAACAAAABEAAAASAAAAEQAAAAgAAAADAAAAAAEAAAgAAAARAAAAEgAAABEAAAAKAAAAAwAAAAACAAAIAAAAEQAAABIAAAARAAAABQAAAAMAAAAAAQAACQAAABEAAAASAAAAEQAAAAcAAAADAAAAAAIAAAkAAAARAAAAEgAAABEAAAAJAAAAAwAAAAACAAAJAAAAEQAAABIAAAARAAAACwAAAAMAAADnAwAACQAAAA4AAAAMAAAADQAAAAEAAAAFAAAAAQAAAAEAAAAOAAAADgAAAA8AAAABAAAABQAAAAAAAAABAAAADgAAAA4AAAAPAAAAAQAAAAQAAAAAAAAAAQAAAA4AAAAOAAAADwAAAAIAAAAEAAAAAAAAAAIAAAAOAAAADgAAAA4AAAAEAAAABAAAAAIAAAADAAAADgAAAA4AAAAOAAAAAwAAAAQAAAAEAAAABAAAAA4AAAAOAAAADgAAAAQAAAAEAAAACAAAAAUAAAAOAAAADgAAAA4AAAAGAAAABAAAAAgAAAAFAAAADgAAAA4AAAAOAAAACAAAAAQAAAAIAAAABQAAAA4AAAAPAAAADgAAAAUAAAAEAAAACAAAAAYAAAAOAAAADwAAAA4AAAAJAAAABAAAAAgAAAAGAAAADgAAAA8AAAAOAAAAAwAAAAQAAAAMAAAABwAAAA4AAAAPAAAADgAAAAQAAAADAAAAGAAAAAcAAAAOAAAADwAAAA4AAAAFAAAAAwAAACAAAAAIAAAADgAAAA8AAAAPAAAABgAAAAMAAABAAAAACAAAAA4AAAAPAAAADwAAAAcAAAADAAAAAAEAAAgAAAAOAAAADwAAAA8AAAAFAAAAAwAAADAAAAAJAAAADgAAAA8AAAAPAAAABgAAAAMAAACAAAAACQAAAA4AAAAPAAAADwAAAAcAAAADAAAAAAEAAAkAAAAOAAAADwAAAA8AAAAIAAAAAwAAAAABAAAJAAAADgAAAA8AAAAPAAAACAAAAAMAAAAAAgAACQAAAA4AAAAPAAAADwAAAAkAAAADAAAAAAIAAAkAAAAOAAAADwAAAA8AAAAKAAAAAwAAAOcDAAAJAAAAIAAAACAAAAAhAAAAIgAAACMAAAAkAAAAJQAAACYAAAAnAAAAKAAAACkAAAApAAAAKgAAACsAAAAsAAAALQAAAC4AAAAvAAAAMAAAADAAAAAxAAAAMQAAADIAAAAzAAAANAAAADUAAAA2AAAANwAAADgAAAA4AEGQmgEL+gEEAAMAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAMAAgABAAEAAQABAAEA//////////8AAAAAAAAAAAEAAQABAAEAAQABAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAP////////////8AAAAAAAABAAQAAwACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAP//////////////////AEGVnAEL+AcIAAAABwAAagYAAAAGAACtBQAAagUAADEFAAAABQAA1AQAAK0EAACKBAAAagQAAEwEAAAxBAAAFwQAAAAEAADpAwAA1AMAAMADAACtAwAAmwMAAIoDAAB5AwAAagMAAFsDAABMAwAAPgMAADEDAAAkAwAAFwMAAAsDAAAAAwAA9AIAAOkCAADeAgAA1AIAAMoCAADAAgAAtgIAAK0CAACkAgAAmwIAAJICAACKAgAAggIAAHkCAAByAgAAagIAAGICAABbAgAAUwIAAEwCAABFAgAAPgIAADcCAAAxAgAAKgIAACQCAAAeAgAAFwIAABECAAALAgAABQIAAAACAAD6AQAA9AEAAO8BAADpAQAA5AEAAN4BAADZAQAA1AEAAM8BAADKAQAAxQEAAMABAAC7AQAAtgEAALIBAACtAQAAqAEAAKQBAACfAQAAmwEAAJcBAACSAQAAjgEAAIoBAACGAQAAggEAAH4BAAB5AQAAdQEAAHIBAABuAQAAagEAAGYBAABiAQAAXgEAAFsBAABXAQAAUwEAAFABAABMAQAASQEAAEUBAABCAQAAPgEAADsBAAA3AQAANAEAADEBAAAuAQAAKgEAACcBAAAkAQAAIQEAAB4BAAAaAQAAFwEAABQBAAARAQAADgEAAAsBAAAIAQAABQEAAAIBAAAAAQAA/QAAAPoAAAD3AAAA9AAAAPEAAADvAAAA7AAAAOkAAADmAAAA5AAAAOEAAADeAAAA3AAAANkAAADXAAAA1AAAANEAAADPAAAAzAAAAMoAAADHAAAAxQAAAMIAAADAAAAAvgAAALsAAAC5AAAAtgAAALQAAACyAAAArwAAAK0AAACrAAAAqAAAAKYAAACkAAAAogAAAJ8AAACdAAAAmwAAAJkAAACXAAAAlQAAAJIA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AAAPAAAAEAAAABIAAAAUAAAAFgAAABgAAAAcAAAAIAAAACgAAAAwAAAAQAAAAIAAAAAAAQAAAAIAAAAEAAAACAAAABAAAAAgAAAAQAAAAIAAAAAAAQBBsLIBC9YEAQAAAAEAAAABAAAAAQAAAAIAAAACAAAAAwAAAAMAAAAEAAAABgAAAAcAAAAIAAAACQAAAAoAAAALAAAADAAAAA0AAAAOAAAADwAAABAAAAABAAEBBgAAAAAAAAQAAAAAEAAABAAAAAAgAAAFAQAAAAAAAAUDAAAAAAAABQQAAAAAAAAFBgAAAAAAAAUHAAAAAAAABQkAAAAAAAAFCgAAAAAAAAUMAAAAAAAABg4AAAAAAAEFEAAAAAAAAQUUAAAAAAABBRYAAAAAAAIFHAAAAAAAAwUgAAAAAAAEBTAAAAAgAAYFQAAAAAAABwWAAAAAAAAIBgABAAAAAAoGAAQAAAAADAYAEAAAIAAABAAAAAAAAAAEAQAAAAAAAAUCAAAAIAAABQQAAAAAAAAFBQAAACAAAAUHAAAAAAAABQgAAAAgAAAFCgAAAAAAAAULAAAAAAAABg0AAAAgAAEFEAAAAAAAAQUSAAAAIAABBRYAAAAAAAIFGAAAACAAAwUgAAAAAAADBSgAAAAAAAYEQAAAABAABgRAAAAAIAAHBYAAAAAAAAkGAAIAAAAACwYACAAAMAAABAAAAAAQAAAEAQAAACAAAAUCAAAAIAAABQMAAAAgAAAFBQAAACAAAAUGAAAAIAAABQgAAAAgAAAFCQAAACAAAAULAAAAIAAABQwAAAAAAAAGDwAAACAAAQUSAAAAIAABBRQAAAAgAAIFGAAAACAAAgUcAAAAIAADBSgAAAAgAAQFMAAAAAAAEAYAAAEAAAAPBgCAAAAAAA4GAEAAAAAADQYAIABBlLcBC4MEAQAAAAEAAAAFAAAADQAAAB0AAAA9AAAAfQAAAP0AAAD9AQAA/QMAAP0HAAD9DwAA/R8AAP0/AAD9fwAA/f8AAP3/AQD9/wMA/f8HAP3/DwD9/x8A/f8/AP3/fwD9//8A/f//Af3//wP9//8H/f//D/3//x/9//8//f//fwAAAAABAAAAAgAAAAMAAAAEAAAABQAAAAYAAAAHAAAACAAAAAkAAAAKAAAACwAAAAwAAAANAAAADgAAAA8AAAAQAAAAEQAAABIAAAAT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IGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZz4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgbG9uZz4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDMyX3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGZsb2F0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxkb3VibGU+AAAAGHQAAFBlAABOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lkRUUAABh0AAB4ZQAATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZkVFAAAYdAAAoGUAAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SW1FRQAAGHQAAMhlAABOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lsRUUAABh0AADwZQAATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJakVFAAAYdAAAGGYAAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWlFRQAAGHQAAEBmAABOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0l0RUUAABh0AABoZgAATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJc0VFAAAYdAAAkGYAAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWFFRQAAGHQAALhmAABOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0ljRUUAAEB0AADwZgAAAAAAAAEAAACIBwAAAAAAAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0lEaU5TXzExY2hhcl90cmFpdHNJRGlFRU5TXzlhbGxvY2F0b3JJRGlFRUVFAAAAQHQAAExnAAAAAAAAAQAAAIgHAAAAAAAATlN0M19fMjEyYmFzaWNfc3RyaW5nSURzTlNfMTFjaGFyX3RyYWl0c0lEc0VFTlNfOWFsbG9jYXRvcklEc0VFRUUAAABAdAAAqGcAAAAAAAABAAAAiAcAAAAAAABOU3QzX18yMTJiYXNpY19zdHJpbmdJd05TXzExY2hhcl90cmFpdHNJd0VFTlNfOWFsbG9jYXRvckl3RUVFRQAAQHQAAABoAAAAAAAAAQAAAIgHAAAAAAAATlN0M19fMjEyYmFzaWNfc3RyaW5nSWhOU18xMWNoYXJfdHJhaXRzSWhFRU5TXzlhbGxvY2F0b3JJaEVFRUUAABEACgAREREAAAAABQAAAAAAAAkAAAAACwAAAAAAAAAAEQAPChEREQMKBwABAAkLCwAACQYLAAALAAYRAAAAERERAEGR0QELIQsAAAAAAAAAABEACgoREREACgAAAgAJCwAAAAkACwAACwBBy9EBCwEMAEHX0QELFQwAAAAADAAAAAAJDAAAAAAADAAADABBhdIBCwEOAEGR0gELFQ0AAAAEDQAAAAAJDgAAAAAADgAADgBBv9IBCwEQAEHL0gELHg8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgBBgtMBCw4SAAAAEhISAAAAAAAACQBBs9MBCwELAEG/0wELFQoAAAAACgAAAAAJCwAAAAAACwAACwBB7dMBCwEMAEH50wELJwwAAAAADAAAAAAJDAAAAAAADAAADAAALSsgICAwWDB4AChudWxsKQBBsNQBC2cwMTIzNDU2Nzg5QUJDREVGGRJEOwI/LEcUPTMwChsGRktFNw9JDo4XA0AdPGkrNh9KLRwBICUpIQgMFRYiLhA4Pgs0MRhkdHV2L0EJfzkRI0MyQomKiwUEJignDSoeNYwHGkiTE5SVAEGg1QEL9hNJbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbgAAYmFzaWNfc3RyaW5nAHN0ZDo6ZXhjZXB0aW9uAAAAAADccQAAPAAAAD0AAAA+AAAAGHQAAORxAABTdDlleGNlcHRpb24AAAAAAAAAAAhyAAAQAAAAPwAAAEAAAACMcgAAFHIAANxxAABTdDExbG9naWNfZXJyb3IAAAAAADhyAAAQAAAAQQAAAEAAAACMcgAARHIAAAhyAABTdDEybGVuZ3RoX2Vycm9yAFN0OXR5cGVfaW5mbwAAABh0AABVcgAAjHIAAAFzAABkcgAAjHIAAKxyAABscgAAAAAAANByAABCAAAAQwAAAEQAAABFAAAARgAAAEcAAABIAAAASQAAAE4xMF9fY3h4YWJpdjExN19fY2xhc3NfdHlwZV9pbmZvRQAAAIxyAADccgAAeHIAAE4xMF9fY3h4YWJpdjEyMF9fc2lfY2xhc3NfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTZfX3NoaW1fdHlwZV9pbmZvRQAAAAAAAABAcwAAQgAAAEoAAABEAAAARQAAAEsAAACMcgAATHMAAGxyAABOMTBfX2N4eGFiaXYxMjNfX2Z1bmRhbWVudGFsX3R5cGVfaW5mb0UAdgAAACxzAAB0cwAAYgAAACxzAACAcwAAYwAAACxzAACMcwAAaAAAACxzAACYcwAAYQAAACxzAACkcwAAcwAAACxzAACwcwAAdAAAACxzAAC8cwAAaQAAACxzAADIcwAAagAAACxzAADUcwAAbAAAACxzAADgcwAAbQAAACxzAADscwAAZgAAACxzAAD4cwAAZAAAACxzAAAEdAAAAAAAAHhyAABCAAAATAAAAEQAAABFAAAARgAAAE0AAABOAAAATwAAAAAAAABgdAAAQgAAAFAAAABEAAAARQAAAEYAAABRAAAAUgAAAFMAAACMcgAAbHQAAHhyAABOMTBfX2N4eGFiaXYxMjFfX3ZtaV9jbGFzc190eXBlX2luZm9FAAAAcHUAQZjpAQtBgC0AAAAyAAABAQAAHgEAAA8AAACALAAAAC0AAAAAAAAeAAAADwAAAAAAAAAwLAAAAAAAABMAAAAHAAAAAAAAAAUAQeTpAQsBOQBB/OkBCwo6AAAAOwAAAC12AEGU6gELAQIAQaPqAQsF//////8AQejqAQsJoH5QAAAAAAAFAEH86gELAVQAQZTrAQsOOgAAAFUAAACYegAAAAQAQazrAQsBAQBBu+sBCwUK/////w==");

var _a;
var BloscShuffle;
(function(BloscShuffle2) {
  BloscShuffle2[BloscShuffle2["NOSHUFFLE"] = 0] = "NOSHUFFLE";
  BloscShuffle2[BloscShuffle2["SHUFFLE"] = 1] = "SHUFFLE";
  BloscShuffle2[BloscShuffle2["BITSHUFFLE"] = 2] = "BITSHUFFLE";
  BloscShuffle2[BloscShuffle2["AUTOSHUFFLE"] = -1] = "AUTOSHUFFLE";
})(BloscShuffle || (BloscShuffle = {}));
const COMPRESSORS = new Set(["blosclz", "lz4", "lz4hc", "snappy", "zlib", "zstd"]);
let emscriptenModule;
const init = () => blosc_codec({ noInitialRun: true, wasmBinary });
const Blosc = (_a = class {
  constructor(clevel = 5, cname = "lz4", shuffle = 1, blocksize = 0) {
    if (clevel < 0 || clevel > 9) {
      throw new Error(`Invalid compression level: '${clevel}'. It should be between 0 and 9`);
    }
    if (!COMPRESSORS.has(cname)) {
      throw new Error(`Invalid compressor '${cname}'. Valid compressors include
        'blosclz', 'lz4', 'lz4hc','snappy', 'zlib', 'zstd'.`);
    }
    if (shuffle < -1 || shuffle > 2) {
      throw new Error(`Invalid shuffle ${shuffle}. Must be one of 0 (NOSHUFFLE),
        1 (SHUFFLE), 2 (BITSHUFFLE), -1 (AUTOSHUFFLE).`);
    }
    this.blocksize = blocksize;
    this.clevel = clevel;
    this.cname = cname;
    this.shuffle = shuffle;
  }
  static fromConfig({ blocksize, clevel, cname, shuffle }) {
    return new _a(clevel, cname, shuffle, blocksize);
  }
  async encode(data) {
    if (!emscriptenModule) {
      emscriptenModule = init();
    }
    const module = await emscriptenModule;
    const view = module.compress(data, this.cname, this.clevel, this.shuffle, this.blocksize);
    const result = new Uint8Array(view);
    module.free_result();
    return result;
  }
  async decode(data, out) {
    if (!emscriptenModule) {
      emscriptenModule = init();
    }
    const module = await emscriptenModule;
    const view = module.decompress(data);
    const result = new Uint8Array(view);
    module.free_result();
    if (out !== void 0) {
      out.set(result);
      return out;
    }
    return result;
  }
}, _a.codecId = "blosc", _a.COMPRESSORS = [...COMPRESSORS], _a.NOSHUFFLE = 0, _a.SHUFFLE = 1, _a.BITSHUFFLE = 2, _a.AUTOSHUFFLE = -1, _a);

var Blosc$1 = Blosc;

const registry = new Map();
function addCodec(id, importFn) {
    registry.set(id, importFn);
}
async function getCodec(config) {
    if (!registry.has(config.id)) {
        throw new Error(`Compression codec ${config.id} is not supported by Zarr.js yet.`);
    }
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const codec = await registry.get(config.id)();
    return codec.fromConfig(config);
}

function createProxy(mapping) {
    return new Proxy(mapping, {
        set(target, key, value, _receiver) {
            return target.setItem(key, value);
        },
        get(target, key, _receiver) {
            return target.getItem(key);
        },
        deleteProperty(target, key) {
            return target.deleteItem(key);
        },
        has(target, key) {
            return target.containsItem(key);
        }
    });
}

function isZarrError(err) {
    return typeof err === 'object' && err !== null && '__zarr__' in err;
}
function isKeyError(o) {
    return isZarrError(o) && o.__zarr__ === 'KeyError';
}
// Custom error messages, note we have to patch the prototype of the
// errors to fix `instanceof` calls, see:
// https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
class ContainsArrayError extends Error {
    constructor(path) {
        super(`path ${path} contains an array`);
        this.__zarr__ = 'ContainsArrayError';
        Object.setPrototypeOf(this, ContainsArrayError.prototype);
    }
}
class ContainsGroupError extends Error {
    constructor(path) {
        super(`path ${path} contains a group`);
        this.__zarr__ = 'ContainsGroupError';
        Object.setPrototypeOf(this, ContainsGroupError.prototype);
    }
}
class ArrayNotFoundError extends Error {
    constructor(path) {
        super(`array not found at path ${path}`);
        this.__zarr__ = 'ArrayNotFoundError';
        Object.setPrototypeOf(this, ArrayNotFoundError.prototype);
    }
}
class GroupNotFoundError extends Error {
    constructor(path) {
        super(`group not found at path ${path}`);
        this.__zarr__ = 'GroupNotFoundError';
        Object.setPrototypeOf(this, GroupNotFoundError.prototype);
    }
}
class PathNotFoundError extends Error {
    constructor(path) {
        super(`nothing found at path ${path}`);
        this.__zarr__ = 'PathNotFoundError';
        Object.setPrototypeOf(this, PathNotFoundError.prototype);
    }
}
class PermissionError extends Error {
    constructor(message) {
        super(message);
        this.__zarr__ = 'PermissionError';
        Object.setPrototypeOf(this, PermissionError.prototype);
    }
}
class KeyError extends Error {
    constructor(key) {
        super(`key ${key} not present`);
        this.__zarr__ = 'KeyError';
        Object.setPrototypeOf(this, KeyError.prototype);
    }
}
class TooManyIndicesError extends RangeError {
    constructor(selection, shape) {
        super(`too many indices for array; expected ${shape.length}, got ${selection.length}`);
        this.__zarr__ = 'TooManyIndicesError';
        Object.setPrototypeOf(this, TooManyIndicesError.prototype);
    }
}
class BoundsCheckError extends RangeError {
    constructor(message) {
        super(message);
        this.__zarr__ = 'BoundsCheckError';
        Object.setPrototypeOf(this, BoundsCheckError.prototype);
    }
}
class InvalidSliceError extends RangeError {
    constructor(from, to, stepSize, reason) {
        super(`slice arguments slice(${from}, ${to}, ${stepSize}) invalid: ${reason}`);
        this.__zarr__ = 'InvalidSliceError';
        Object.setPrototypeOf(this, InvalidSliceError.prototype);
    }
}
class NegativeStepError extends Error {
    constructor() {
        super(`Negative step size is not supported when indexing.`);
        this.__zarr__ = 'NegativeStepError';
        Object.setPrototypeOf(this, NegativeStepError.prototype);
    }
}
class ValueError extends Error {
    constructor(message) {
        super(message);
        this.__zarr__ = 'ValueError';
        Object.setPrototypeOf(this, ValueError.prototype);
    }
}
class HTTPError extends Error {
    constructor(code) {
        super(code);
        this.__zarr__ = 'HTTPError';
        Object.setPrototypeOf(this, HTTPError.prototype);
    }
}

function slice$1(start, stop = undefined, step = null) {
    // tslint:disable-next-line: strict-type-predicates
    if (start === undefined) { // Not possible in typescript
        throw new InvalidSliceError(start, stop, step, "The first argument must not be undefined");
    }
    if ((typeof start === "string" && start !== ":") || (typeof stop === "string" && stop !== ":")) { // Note in typescript this will never happen with type checking.
        throw new InvalidSliceError(start, stop, step, "Arguments can only be integers, \":\" or null");
    }
    // slice(5) === slice(null, 5)
    if (stop === undefined) {
        stop = start;
        start = null;
    }
    // if (start !== null && stop !== null && start > stop) {
    //     throw new InvalidSliceError(start, stop, step, "to is higher than from");
    // }
    return {
        start: start === ":" ? null : start,
        stop: stop === ":" ? null : stop,
        step,
        _slice: true,
    };
}
/**
 * Port of adjustIndices
 * https://github.com/python/cpython/blob/master/Objects/sliceobject.c#L243
 */
function adjustIndices(start, stop, step, length) {
    if (start < 0) {
        start += length;
        if (start < 0) {
            start = (step < 0) ? -1 : 0;
        }
    }
    else if (start >= length) {
        start = (step < 0) ? length - 1 : length;
    }
    if (stop < 0) {
        stop += length;
        if (stop < 0) {
            stop = (step < 0) ? -1 : 0;
        }
    }
    else if (stop >= length) {
        stop = (step < 0) ? length - 1 : length;
    }
    if (step < 0) {
        if (stop < start) {
            const length = Math.floor((start - stop - 1) / (-step) + 1);
            return [start, stop, step, length];
        }
    }
    else {
        if (start < stop) {
            const length = Math.floor((stop - start - 1) / step + 1);
            return [start, stop, step, length];
        }
    }
    return [start, stop, step, 0];
}
/**
 * Port of slice.indices(n) and PySlice_Unpack
 * https://github.com/python/cpython/blob/master/Objects/sliceobject.c#L166
 *  https://github.com/python/cpython/blob/master/Objects/sliceobject.c#L198
 *
 * Behaviour might be slightly different as it's a weird hybrid implementation.
 */
function sliceIndices(slice, length) {
    let start;
    let stop;
    let step;
    if (slice.step === null) {
        step = 1;
    }
    else {
        step = slice.step;
    }
    if (slice.start === null) {
        start = step < 0 ? Number.MAX_SAFE_INTEGER : 0;
    }
    else {
        start = slice.start;
        if (start < 0) {
            start += length;
        }
    }
    if (slice.stop === null) {
        stop = step < 0 ? -Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    }
    else {
        stop = slice.stop;
        if (stop < 0) {
            stop += length;
        }
    }
    // This clips out of bounds slices
    const s = adjustIndices(start, stop, step, length);
    start = s[0];
    stop = s[1];
    step = s[2];
    // The output length
    length = s[3];
    // With out of bounds slicing these two assertions are not useful.
    // if (stop > length) throw new Error("Stop greater than length");
    // if (start >= length) throw new Error("Start greater than or equal to length");
    if (step === 0)
        throw new Error("Step size 0 is invalid");
    return [start, stop, step, length];
}

function ensureArray(selection) {
    if (!Array.isArray(selection)) {
        return [selection];
    }
    return selection;
}
function checkSelectionLength(selection, shape) {
    if (selection.length > shape.length) {
        throw new TooManyIndicesError(selection, shape);
    }
}
/**
 * Returns both the sliceIndices per dimension and the output shape after slicing.
 */
function selectionToSliceIndices(selection, shape) {
    const sliceIndicesResult = [];
    const outShape = [];
    for (let i = 0; i < selection.length; i++) {
        const s = selection[i];
        if (typeof s === "number") {
            sliceIndicesResult.push(s);
        }
        else {
            const x = sliceIndices(s, shape[i]);
            const dimLength = x[3];
            outShape.push(dimLength);
            sliceIndicesResult.push(x);
        }
    }
    return [sliceIndicesResult, outShape];
}
/**
 * This translates "...", ":", null into a list of slices or non-negative integer selections of length shape
 */
function normalizeArraySelection(selection, shape, convertIntegerSelectionToSlices = false) {
    selection = replaceEllipsis(selection, shape);
    for (let i = 0; i < selection.length; i++) {
        const dimSelection = selection[i];
        if (typeof dimSelection === "number") {
            if (convertIntegerSelectionToSlices) {
                selection[i] = slice$1(dimSelection, dimSelection + 1, 1);
            }
            else {
                selection[i] = normalizeIntegerSelection(dimSelection, shape[i]);
            }
        }
        else if (isIntegerArray(dimSelection)) {
            throw new TypeError("Integer array selections are not supported (yet)");
        }
        else if (dimSelection === ":" || dimSelection === null) {
            selection[i] = slice$1(null, null, 1);
        }
    }
    return selection;
}
function replaceEllipsis(selection, shape) {
    selection = ensureArray(selection);
    let ellipsisIndex = -1;
    let numEllipsis = 0;
    for (let i = 0; i < selection.length; i++) {
        if (selection[i] === "...") {
            ellipsisIndex = i;
            numEllipsis += 1;
        }
    }
    if (numEllipsis > 1) {
        throw new RangeError("an index can only have a single ellipsis ('...')");
    }
    if (numEllipsis === 1) {
        // count how many items to left and right of ellipsis
        const numItemsLeft = ellipsisIndex;
        const numItemsRight = selection.length - (numItemsLeft + 1);
        const numItems = selection.length - 1; // All non-ellipsis items
        if (numItems >= shape.length) {
            // Ellipsis does nothing, just remove it
            selection = selection.filter((x) => x !== "...");
        }
        else {
            // Replace ellipsis with as many slices are needed for number of dims
            const numNewItems = shape.length - numItems;
            let newItem = selection.slice(0, numItemsLeft).concat(new Array(numNewItems).fill(null));
            if (numItemsRight > 0) {
                newItem = newItem.concat(selection.slice(selection.length - numItemsRight));
            }
            selection = newItem;
        }
    }
    // Fill out selection if not completely specified
    if (selection.length < shape.length) {
        const numMissing = shape.length - selection.length;
        selection = selection.concat(new Array(numMissing).fill(null));
    }
    checkSelectionLength(selection, shape);
    return selection;
}
function normalizeIntegerSelection(dimSelection, dimLength) {
    // Note: Maybe we should convert to integer or warn if dimSelection is not an integer
    // handle wraparound
    if (dimSelection < 0) {
        dimSelection = dimLength + dimSelection;
    }
    // handle out of bounds
    if (dimSelection >= dimLength || dimSelection < 0) {
        throw new BoundsCheckError(`index out of bounds for dimension with length ${dimLength}`);
    }
    return dimSelection;
}
function isInteger(s) {
    return typeof s === "number";
}
function isIntegerArray(s) {
    if (!Array.isArray(s)) {
        return false;
    }
    for (const e of s) {
        if (typeof e !== "number") {
            return false;
        }
    }
    return true;
}
function isSlice(s) {
    if (s !== null && s["_slice"] === true) {
        return true;
    }
    return false;
}
function isContiguousSlice(s) {
    return isSlice(s) && (s.step === null || s.step === 1);
}
function isContiguousSelection(selection) {
    selection = ensureArray(selection);
    for (let i = 0; i < selection.length; i++) {
        const s = selection[i];
        if (!(isIntegerArray(s) || isContiguousSlice(s) || s === "...")) {
            return false;
        }
    }
    return true;
}
function* product(...iterables) {
    if (iterables.length === 0) {
        return;
    }
    // make a list of iterators from the iterables
    const iterators = iterables.map(it => it());
    const results = iterators.map(it => it.next());
    // Disabled to allow empty inputs
    // if (results.some(r => r.done)) {
    //     throw new Error("Input contains an empty iterator.");
    // }
    for (let i = 0;;) {
        if (results[i].done) {
            // reset the current iterator
            iterators[i] = iterables[i]();
            results[i] = iterators[i].next();
            // advance, and exit if we've reached the end
            if (++i >= iterators.length) {
                return;
            }
        }
        else {
            yield results.map(({ value }) => value);
            i = 0;
        }
        results[i] = iterators[i].next();
    }
}
class BasicIndexer {
    constructor(selection, array) {
        selection = normalizeArraySelection(selection, array.shape);
        // Setup per-dimension indexers
        this.dimIndexers = [];
        const arrayShape = array.shape;
        for (let i = 0; i < arrayShape.length; i++) {
            let dimSelection = selection[i];
            const dimLength = arrayShape[i];
            const dimChunkLength = array.chunks[i];
            if (dimSelection === null) {
                dimSelection = slice$1(null);
            }
            if (isInteger(dimSelection)) {
                this.dimIndexers.push(new IntDimIndexer(dimSelection, dimLength, dimChunkLength));
            }
            else if (isSlice(dimSelection)) {
                this.dimIndexers.push(new SliceDimIndexer(dimSelection, dimLength, dimChunkLength));
            }
            else {
                throw new RangeError(`Unspported selection item for basic indexing; expected integer or slice, got ${dimSelection}`);
            }
        }
        this.shape = [];
        for (const d of this.dimIndexers) {
            if (d instanceof SliceDimIndexer) {
                this.shape.push(d.numItems);
            }
        }
        this.dropAxes = null;
    }
    *iter() {
        const dimIndexerIterables = this.dimIndexers.map(x => (() => x.iter()));
        const dimIndexerProduct = product(...dimIndexerIterables);
        for (const dimProjections of dimIndexerProduct) {
            // TODO fix this, I think the product outputs too many combinations
            const chunkCoords = [];
            const chunkSelection = [];
            const outSelection = [];
            for (const p of dimProjections) {
                chunkCoords.push((p).dimChunkIndex);
                chunkSelection.push((p).dimChunkSelection);
                if ((p).dimOutSelection !== null) {
                    outSelection.push((p).dimOutSelection);
                }
            }
            yield {
                chunkCoords,
                chunkSelection,
                outSelection,
            };
        }
    }
}
class IntDimIndexer {
    constructor(dimSelection, dimLength, dimChunkLength) {
        dimSelection = normalizeIntegerSelection(dimSelection, dimLength);
        this.dimSelection = dimSelection;
        this.dimLength = dimLength;
        this.dimChunkLength = dimChunkLength;
        this.numItems = 1;
    }
    *iter() {
        const dimChunkIndex = Math.floor(this.dimSelection / this.dimChunkLength);
        const dimOffset = dimChunkIndex * this.dimChunkLength;
        const dimChunkSelection = this.dimSelection - dimOffset;
        const dimOutSelection = null;
        yield {
            dimChunkIndex,
            dimChunkSelection,
            dimOutSelection,
        };
    }
}
class SliceDimIndexer {
    constructor(dimSelection, dimLength, dimChunkLength) {
        // Normalize
        const [start, stop, step] = sliceIndices(dimSelection, dimLength);
        this.start = start;
        this.stop = stop;
        this.step = step;
        if (this.step < 1) {
            throw new NegativeStepError();
        }
        this.dimLength = dimLength;
        this.dimChunkLength = dimChunkLength;
        this.numItems = Math.max(0, Math.ceil((this.stop - this.start) / this.step));
        this.numChunks = Math.ceil(this.dimLength / this.dimChunkLength);
    }
    *iter() {
        const dimChunkIndexFrom = Math.floor(this.start / this.dimChunkLength);
        const dimChunkIndexTo = Math.ceil(this.stop / this.dimChunkLength);
        // Iterate over chunks in range
        for (let dimChunkIndex = dimChunkIndexFrom; dimChunkIndex < dimChunkIndexTo; dimChunkIndex++) {
            // Compute offsets for chunk within overall array
            const dimOffset = dimChunkIndex * this.dimChunkLength;
            const dimLimit = Math.min(this.dimLength, (dimChunkIndex + 1) * this.dimChunkLength);
            // Determine chunk length, accounting for trailing chunk
            const dimChunkLength = dimLimit - dimOffset;
            let dimChunkSelStart;
            let dimChunkSelStop;
            let dimOutOffset;
            if (this.start < dimOffset) {
                // Selection starts before current chunk
                dimChunkSelStart = 0;
                const remainder = (dimOffset - this.start) % this.step;
                if (remainder > 0) {
                    dimChunkSelStart += this.step - remainder;
                }
                // Compute number of previous items, provides offset into output array
                dimOutOffset = Math.ceil((dimOffset - this.start) / this.step);
            }
            else {
                // Selection starts within current chunk
                dimChunkSelStart = this.start - dimOffset;
                dimOutOffset = 0;
            }
            if (this.stop > dimLimit) {
                // Selection ends after current chunk
                dimChunkSelStop = dimChunkLength;
            }
            else {
                // Selection ends within current chunk
                dimChunkSelStop = this.stop - dimOffset;
            }
            const dimChunkSelection = slice$1(dimChunkSelStart, dimChunkSelStop, this.step);
            const dimChunkNumItems = Math.ceil((dimChunkSelStop - dimChunkSelStart) / this.step);
            const dimOutSelection = slice$1(dimOutOffset, dimOutOffset + dimChunkNumItems);
            yield {
                dimChunkIndex,
                dimChunkSelection,
                dimOutSelection,
            };
        }
    }
}

/**
 * This should be true only if this javascript is getting executed in Node.
 */
const IS_NODE = typeof process !== "undefined" && process.versions && process.versions.node;
// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() { }
// eslint-disable-next-line @typescript-eslint/ban-types
function normalizeStoragePath(path) {
    if (path === null) {
        return "";
    }
    if (path instanceof String) {
        path = path.valueOf();
    }
    // convert backslash to forward slash
    path = path.replace(/\\/g, "/");
    // ensure no leading slash
    while (path.length > 0 && path[0] === '/') {
        path = path.slice(1);
    }
    // ensure no trailing slash
    while (path.length > 0 && path[path.length - 1] === '/') {
        path = path.slice(0, path.length - 1);
    }
    // collapse any repeated slashes
    path = path.replace(/\/\/+/g, "/");
    // don't allow path segments with just '.' or '..'
    const segments = path.split('/');
    for (const s of segments) {
        if (s === "." || s === "..") {
            throw Error("path containing '.' or '..' segment not allowed");
        }
    }
    return path;
}
function normalizeShape(shape) {
    if (typeof shape === "number") {
        shape = [shape];
    }
    return shape.map(x => Math.floor(x));
}
function normalizeChunks(chunks, shape) {
    // Assume shape is already normalized
    if (chunks === null || chunks === true) {
        throw new Error("Chunk guessing is not supported yet");
    }
    if (chunks === false) {
        return shape;
    }
    if (typeof chunks === "number") {
        chunks = [chunks];
    }
    // handle underspecified chunks
    if (chunks.length < shape.length) {
        // assume chunks across remaining dimensions
        chunks = chunks.concat(shape.slice(chunks.length));
    }
    return chunks.map((x, idx) => {
        // handle null or -1 in chunks
        if (x === -1 || x === null) {
            return shape[idx];
        }
        else {
            return Math.floor(x);
        }
    });
}
function normalizeOrder(order) {
    order = order.toUpperCase();
    return order;
}
function normalizeDtype(dtype) {
    return dtype;
}
function normalizeFillValue(fillValue) {
    return fillValue;
}
/**
 * Determine whether `item` specifies a complete slice of array with the
 *  given `shape`. Used to optimize __setitem__ operations on chunks
 * @param item
 * @param shape
 */
function isTotalSlice(item, shape) {
    if (item === null) {
        return true;
    }
    if (!Array.isArray(item)) {
        item = [item];
    }
    for (let i = 0; i < Math.min(item.length, shape.length); i++) {
        const it = item[i];
        if (it === null)
            continue;
        if (isSlice(it)) {
            const s = it;
            const isStepOne = s.step === 1 || s.step === null;
            if (s.start === null && s.stop === null && isStepOne) {
                continue;
            }
            if ((s.stop - s.start) === shape[i] && isStepOne) {
                continue;
            }
            return false;
        }
        return false;
        // } else {
        //     console.error(`isTotalSlice unexpected non-slice, got ${it}`);
        //     return false;
        // }
    }
    return true;
}
/**
 * Checks for === equality of all elements.
 */
function arrayEquals1D(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
/*
 * Determines "C" order strides for a given shape array.
 * Strides provide integer steps in each dimention to traverse an ndarray.
 *
 * NOTE: - These strides here are distinct from numpy.ndarray.strides, which describe actual byte steps.
 *       - Strides are assumed to be contiguous, so initial step is 1. Thus, output will always be [XX, XX, 1].
 */
function getStrides(shape) {
    // adapted from https://github.com/scijs/ndarray/blob/master/ndarray.js#L326-L330
    const ndim = shape.length;
    const strides = Array(ndim);
    let step = 1; // init step
    for (let i = ndim - 1; i >= 0; i--) {
        strides[i] = step;
        step *= shape[i];
    }
    return strides;
}
function resolveUrl(root, path) {
    const base = typeof root === 'string' ? new URL(root) : root;
    if (!base.pathname.endsWith('/')) {
        // ensure trailing slash so that base is resolved as _directory_
        base.pathname += '/';
    }
    const resolved = new URL(path, base);
    // copy search params to new URL
    resolved.search = base.search;
    return resolved.href;
}
/**
 * Swaps byte order in-place for a given TypedArray.
 * Used to flip endian-ness when getting/setting chunks from/to zarr store.
 * @param src TypedArray
 */
function byteSwapInplace(src) {
    const b = src.BYTES_PER_ELEMENT;
    if (b === 1)
        return; // no swapping needed
    if (IS_NODE) {
        // Use builtin methods for swapping if in Node environment
        const bytes = Buffer.from(src.buffer, src.byteOffset, src.length * b);
        if (b === 2)
            bytes.swap16();
        if (b === 4)
            bytes.swap32();
        if (b === 8)
            bytes.swap64();
        return;
    }
    // In browser, need to flip manually
    // Adapted from https://github.com/zbjornson/node-bswap/blob/master/bswap.js
    const flipper = new Uint8Array(src.buffer, src.byteOffset, src.length * b);
    const numFlips = b / 2;
    const endByteIndex = b - 1;
    let t;
    for (let i = 0; i < flipper.length; i += b) {
        for (let j = 0; j < numFlips; j++) {
            t = flipper[i + j];
            flipper[i + j] = flipper[i + endByteIndex - j];
            flipper[i + endByteIndex - j] = t;
        }
    }
}
/**
 * Creates a copy of a TypedArray and swaps bytes.
 * Used to flip endian-ness when getting/setting chunks from/to zarr store.
 * @param src TypedArray
 */
function byteSwap$1(src) {
    const copy = src.slice();
    byteSwapInplace(copy);
    return copy;
}
function convertColMajorToRowMajor2D(src, out, shape) {
    let idx = 0;
    const shape0 = shape[0];
    const shape1 = shape[1];
    const stride0 = shape1;
    for (let i1 = 0; i1 < shape1; i1++) {
        for (let i0 = 0; i0 < shape0; i0++) {
            out[i0 * stride0 + i1] = src[idx++];
        }
    }
}
function convertColMajorToRowMajor3D(src, out, shape) {
    let idx = 0;
    const shape0 = shape[0];
    const shape1 = shape[1];
    const shape2 = shape[2];
    const stride0 = shape2 * shape1;
    const stride1 = shape2;
    for (let i2 = 0; i2 < shape2; i2++) {
        for (let i1 = 0; i1 < shape1; i1++) {
            for (let i0 = 0; i0 < shape0; i0++) {
                out[i0 * stride0 + i1 * stride1 + i2] = src[idx++];
            }
        }
    }
}
function convertColMajorToRowMajor4D(src, out, shape) {
    let idx = 0;
    const shape0 = shape[0];
    const shape1 = shape[1];
    const shape2 = shape[2];
    const shape3 = shape[3];
    const stride0 = shape3 * shape2 * shape1;
    const stride1 = shape3 * shape2;
    const stride2 = shape3;
    for (let i3 = 0; i3 < shape3; i3++) {
        for (let i2 = 0; i2 < shape2; i2++) {
            for (let i1 = 0; i1 < shape1; i1++) {
                for (let i0 = 0; i0 < shape0; i0++) {
                    out[i0 * stride0 + i1 * stride1 + i2 * stride2 + i3] = src[idx++];
                }
            }
        }
    }
}
function convertColMajorToRowMajorGeneric(src, out, shape) {
    const nDims = shape.length;
    const size = shape.reduce((r, a) => r * a);
    const rowMajorStrides = shape.map((_, i) => i + 1 === nDims ? 1 : shape.slice(i + 1).reduce((r, a) => r * a, 1));
    const index = Array(nDims).fill(0);
    for (let colMajorIdx = 0; colMajorIdx < size; colMajorIdx++) {
        let rowMajorIdx = 0;
        for (let dim = 0; dim < nDims; dim++) {
            rowMajorIdx += index[dim] * rowMajorStrides[dim];
        }
        out[rowMajorIdx] = src[colMajorIdx];
        index[0] += 1;
        // Handle carry-over
        for (let dim = 0; dim < nDims; dim++) {
            if (index[dim] === shape[dim]) {
                if (dim + 1 === nDims) {
                    return;
                }
                index[dim] = 0;
                index[dim + 1] += 1;
            }
        }
    }
}
const colMajorToRowMajorConverters = {
    [0]: noop,
    [1]: noop,
    [2]: convertColMajorToRowMajor2D,
    [3]: convertColMajorToRowMajor3D,
    [4]: convertColMajorToRowMajor4D,
};
/**
 * Rewrites a copy of a TypedArray while converting it from column-major (F-order) to row-major (C-order).
 * @param src TypedArray
 * @param out TypedArray
 * @param shape number[]
 */
function convertColMajorToRowMajor(src, out, shape) {
    return (colMajorToRowMajorConverters[shape.length] || convertColMajorToRowMajorGeneric)(src, out, shape);
}
function isArrayBufferLike(obj) {
    if (obj === null) {
        return false;
    }
    if (obj instanceof ArrayBuffer) {
        return true;
    }
    if (typeof SharedArrayBuffer === "function" && obj instanceof SharedArrayBuffer) {
        return true;
    }
    if (IS_NODE) { // Necessary for Node.js for some reason..
        return obj.toString().startsWith("[object ArrayBuffer]")
            || obj.toString().startsWith("[object SharedArrayBuffer]");
    }
    return false;
}

const ARRAY_META_KEY = ".zarray";
const GROUP_META_KEY = ".zgroup";
const ATTRS_META_KEY = ".zattrs";

/**
 * Return true if the store contains an array at the given logical path.
 */
async function containsArray(store, path = null) {
    path = normalizeStoragePath(path);
    const prefix = pathToPrefix(path);
    const key = prefix + ARRAY_META_KEY;
    return store.containsItem(key);
}
/**
 * Return true if the store contains a group at the given logical path.
 */
async function containsGroup(store, path = null) {
    path = normalizeStoragePath(path);
    const prefix = pathToPrefix(path);
    const key = prefix + GROUP_META_KEY;
    return store.containsItem(key);
}
function pathToPrefix(path) {
    // assume path already normalized
    if (path.length > 0) {
        return path + '/';
    }
    return '';
}
async function requireParentGroup(store, path, chunkStore, overwrite) {
    // Assume path is normalized
    if (path.length === 0) {
        return;
    }
    const segments = path.split("/");
    let p = "";
    for (const s of segments.slice(0, segments.length - 1)) {
        p += s;
        if (await containsArray(store, p)) {
            await initGroupMetadata(store, p, overwrite);
        }
        else if (!await containsGroup(store, p)) {
            await initGroupMetadata(store, p);
        }
        p += "/";
    }
}
async function initGroupMetadata(store, path = null, overwrite = false) {
    path = normalizeStoragePath(path);
    // Guard conditions
    if (overwrite) {
        throw Error("Group overwriting not implemented yet :(");
    }
    else if (await containsArray(store, path)) {
        throw new ContainsArrayError(path);
    }
    else if (await containsGroup(store, path)) {
        throw new ContainsGroupError(path);
    }
    const metadata = { zarr_format: 2 };
    const key = pathToPrefix(path) + GROUP_META_KEY;
    await store.setItem(key, JSON.stringify(metadata));
}
/**
 *  Initialize a group store. Note that this is a low-level function and there should be no
 *  need to call this directly from user code.
 */
async function initGroup(store, path = null, chunkStore = null, overwrite = false) {
    path = normalizeStoragePath(path);
    await requireParentGroup(store, path, chunkStore, overwrite);
    await initGroupMetadata(store, path, overwrite);
}
async function initArrayMetadata(store, shape, chunks, dtype, path, compressor, fillValue, order, overwrite, chunkStore, filters, dimensionSeparator) {
    // Guard conditions
    if (overwrite) {
        throw Error("Array overwriting not implemented yet :(");
    }
    else if (await containsArray(store, path)) {
        throw new ContainsArrayError(path);
    }
    else if (await containsGroup(store, path)) {
        throw new ContainsGroupError(path);
    }
    // Normalize metadata,  does type checking too.
    dtype = normalizeDtype(dtype);
    shape = normalizeShape(shape);
    chunks = normalizeChunks(chunks, shape);
    order = normalizeOrder(order);
    fillValue = normalizeFillValue(fillValue);
    if (filters !== null && filters.length > 0) {
        throw Error("Filters are not supported yet");
    }
    let serializedFillValue = fillValue;
    if (typeof fillValue === "number") {
        if (Number.isNaN(fillValue))
            serializedFillValue = "NaN";
        if (Number.POSITIVE_INFINITY === fillValue)
            serializedFillValue = "Infinity";
        if (Number.NEGATIVE_INFINITY === fillValue)
            serializedFillValue = "-Infinity";
    }
    filters = null;
    const metadata = {
        zarr_format: 2,
        shape: shape,
        chunks: chunks,
        dtype: dtype,
        fill_value: serializedFillValue,
        order: order,
        compressor: compressor,
        filters: filters,
    };
    if (dimensionSeparator) {
        metadata.dimension_separator = dimensionSeparator;
    }
    const metaKey = pathToPrefix(path) + ARRAY_META_KEY;
    await store.setItem(metaKey, JSON.stringify(metadata));
}
/**
 *
 * Initialize an array store with the given configuration. Note that this is a low-level
 * function and there should be no need to call this directly from user code
 */
async function initArray(store, shape, chunks, dtype, path = null, compressor = null, fillValue = null, order = "C", overwrite = false, chunkStore = null, filters = null, dimensionSeparator) {
    path = normalizeStoragePath(path);
    await requireParentGroup(store, path, chunkStore, overwrite);
    await initArrayMetadata(store, shape, chunks, dtype, path, compressor, fillValue, order, overwrite, chunkStore, filters, dimensionSeparator);
}

function parseMetadata(s) {
    // Here we allow that a store may return an already-parsed metadata object,
    // or a string of JSON that we will parse here. We allow for an already-parsed
    // object to accommodate a consolidated metadata store, where all the metadata for
    // all groups and arrays will already have been parsed from JSON.
    // IPFS returns already parsed object
    if (typeof s === 'object') {
        return s;
    }
    if (typeof s !== 'string') {
        // tslint:disable-next-line: strict-type-predicates
        if (IS_NODE && Buffer.isBuffer(s)) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return JSON.parse(s.toString());
        }
        else if (isArrayBufferLike(s)) {
            const utf8Decoder = new TextDecoder();
            const bytes = new Uint8Array(s);
            return JSON.parse(utf8Decoder.decode(bytes));
        }
        else {
            return s;
        }
    }
    return JSON.parse(s);
}

/**
 * Class providing access to user attributes on an array or group. Should not be
 * instantiated directly, will be available via the `.attrs` property of an array or
 * group.
 */
class Attributes {
    constructor(store, key, readOnly, cache = true) {
        this.store = store;
        this.key = key;
        this.readOnly = readOnly;
        this.cache = cache;
        this.cachedValue = null;
    }
    /**
     * Retrieve all attributes as a JSON object.
     */
    async asObject() {
        if (this.cache && this.cachedValue !== null) {
            return this.cachedValue;
        }
        const o = await this.getNoSync();
        if (this.cache) {
            this.cachedValue = o;
        }
        return o;
    }
    async getNoSync() {
        try {
            const data = await this.store.getItem(this.key);
            // TODO fix typing?
            return parseMetadata(data);
        }
        catch (error) {
            return {};
        }
    }
    async setNoSync(key, value) {
        const d = await this.getNoSync();
        d[key] = value;
        await this.putNoSync(d);
        return true;
    }
    async putNoSync(m) {
        await this.store.setItem(this.key, JSON.stringify(m));
        if (this.cache) {
            this.cachedValue = m;
        }
    }
    async delNoSync(key) {
        const d = await this.getNoSync();
        delete d[key];
        await this.putNoSync(d);
        return true;
    }
    /**
     * Overwrite all attributes with the provided object in a single operation
     */
    async put(d) {
        if (this.readOnly) {
            throw new PermissionError("attributes are read-only");
        }
        return this.putNoSync(d);
    }
    async setItem(key, value) {
        if (this.readOnly) {
            throw new PermissionError("attributes are read-only");
        }
        return this.setNoSync(key, value);
    }
    async getItem(key) {
        return (await this.asObject())[key];
    }
    async deleteItem(key) {
        if (this.readOnly) {
            throw new PermissionError("attributes are read-only");
        }
        return this.delNoSync(key);
    }
    async containsItem(key) {
        return (await this.asObject())[key] !== undefined;
    }
    proxy() {
        return createProxy(this);
    }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Float16Array = globalThis.Float16Array;
const DTYPE_TYPEDARRAY_MAPPING = {
    '|b': Int8Array,
    '|b1': Uint8Array,
    '|B': Uint8Array,
    '|u1': Uint8Array,
    '|i1': Int8Array,
    '<b': Int8Array,
    '<B': Uint8Array,
    '<u1': Uint8Array,
    '<i1': Int8Array,
    '<u2': Uint16Array,
    '<i2': Int16Array,
    '<u4': Uint32Array,
    '<i4': Int32Array,
    '<f4': Float32Array,
    '<f2': Float16Array,
    '<f8': Float64Array,
    '>b': Int8Array,
    '>B': Uint8Array,
    '>u1': Uint8Array,
    '>i1': Int8Array,
    '>u2': Uint16Array,
    '>i2': Int16Array,
    '>u4': Uint32Array,
    '>i4': Int32Array,
    '>f4': Float32Array,
    '>f2': Float16Array,
    '>f8': Float64Array
};
function getTypedArrayCtr(dtype) {
    const ctr = DTYPE_TYPEDARRAY_MAPPING[dtype];
    if (!ctr) {
        if (dtype.slice(1) === 'f2') {
            throw Error(`'${dtype}' is not supported natively in zarr.js. ` +
                `In order to access this dataset you must make Float16Array available as a global. ` +
                `See https://github.com/gzuidhof/zarr.js/issues/127`);
        }
        throw Error(`Dtype not recognized or not supported in zarr.js, got ${dtype}.`);
    }
    return ctr;
}
/*
 * Called by NestedArray and RawArray constructors only.
 * We byte-swap the buffer of a store after decoding
 * since TypedArray views are little endian only.
 *
 * This means NestedArrays and RawArrays will always be little endian,
 * unless a numpy-like library comes around and can handle endianess
 * for buffer views.
 */
function getTypedArrayDtypeString(t) {
    // Favour the types below instead of small and big B
    if (t instanceof Uint8Array)
        return '|u1';
    if (t instanceof Int8Array)
        return '|i1';
    if (t instanceof Uint16Array)
        return '<u2';
    if (t instanceof Int16Array)
        return '<i2';
    if (t instanceof Uint32Array)
        return '<u4';
    if (t instanceof Int32Array)
        return '<i4';
    if (t instanceof Float32Array)
        return '<f4';
    if (t instanceof Float64Array)
        return '<f8';
    throw new ValueError('Mapping for TypedArray to Dtypestring not known');
}

/**
 * Digs down into the dimensions of given array to find the TypedArray and returns its constructor.
 * Better to use sparingly.
 */
function getNestedArrayConstructor(arr) {
    // TODO fix typing
    // tslint:disable-next-line: strict-type-predicates
    if (arr.byteLength !== undefined) {
        return (arr).constructor;
    }
    return getNestedArrayConstructor(arr[0]);
}
/**
 * Returns both the slice result and new output shape
 * @param arr NestedArray to slice
 * @param shape The shape of the NestedArray
 * @param selection
 */
function sliceNestedArray(arr, shape, selection) {
    // This translates "...", ":", null into a list of slices or integer selections
    const normalizedSelection = normalizeArraySelection(selection, shape);
    const [sliceIndices, outShape] = selectionToSliceIndices(normalizedSelection, shape);
    const outArray = _sliceNestedArray(arr, shape, sliceIndices);
    return [outArray, outShape];
}
function _sliceNestedArray(arr, shape, selection) {
    const currentSlice = selection[0];
    // Is this necessary?
    // // This is possible when a slice list is passed shorter than the amount of dimensions
    // // tslint:disable-next-line: strict-type-predicates
    // if (currentSlice === undefined) {
    //     return arr.slice();
    // }
    // When a number is passed that dimension is squeezed
    if (typeof currentSlice === "number") {
        // Assume already normalized integer selection here.
        if (shape.length === 1) {
            return arr[currentSlice];
        }
        else {
            return _sliceNestedArray(arr[currentSlice], shape.slice(1), selection.slice(1));
        }
    }
    const [from, to, step, outputSize] = currentSlice;
    if (outputSize === 0) {
        return new (getNestedArrayConstructor(arr))(0);
    }
    if (shape.length === 1) {
        if (step === 1) {
            return arr.slice(from, to);
        }
        const newArrData = new arr.constructor(outputSize);
        for (let i = 0; i < outputSize; i++) {
            newArrData[i] = arr[from + i * step];
        }
        return newArrData;
    }
    let newArr = new Array(outputSize);
    for (let i = 0; i < outputSize; i++) {
        newArr[i] = _sliceNestedArray(arr[from + i * step], shape.slice(1), selection.slice(1));
    }
    // This is necessary to ensure that the return value is a NestedArray if the last dimension is squeezed
    // e.g. shape [2,1] with slice [:, 0] would otherwise result in a list of numbers instead of a valid NestedArray
    if (outputSize > 0 && typeof newArr[0] === "number") {
        const typedArrayConstructor = arr[0].constructor;
        newArr = typedArrayConstructor.from(newArr);
    }
    return newArr;
}
function setNestedArrayToScalar(dstArr, value, destShape, selection) {
    // This translates "...", ":", null, etc into a list of slices.
    const normalizedSelection = normalizeArraySelection(selection, destShape, true);
    // Above we force the results to be SliceIndicesIndices only, without integer selections making this cast is safe.
    const [sliceIndices, _outShape] = selectionToSliceIndices(normalizedSelection, destShape);
    _setNestedArrayToScalar(dstArr, value, destShape, sliceIndices);
}
function setNestedArray(dstArr, sourceArr, destShape, sourceShape, selection) {
    // This translates "...", ":", null, etc into a list of slices.
    const normalizedSelection = normalizeArraySelection(selection, destShape, false);
    const [sliceIndices, outShape] = selectionToSliceIndices(normalizedSelection, destShape);
    // TODO: replace with non stringify equality check
    if (JSON.stringify(outShape) !== JSON.stringify(sourceShape)) {
        throw new ValueError(`Shape mismatch in target and source NestedArray: ${outShape} and ${sourceShape}`);
    }
    _setNestedArray(dstArr, sourceArr, destShape, sliceIndices);
}
function _setNestedArray(dstArr, sourceArr, shape, selection) {
    const currentSlice = selection[0];
    if (typeof sourceArr === "number") {
        _setNestedArrayToScalar(dstArr, sourceArr, shape, selection.map(x => typeof x === "number" ? [x, x + 1, 1, 1] : x));
        return;
    }
    // This dimension is squeezed.
    if (typeof currentSlice === "number") {
        _setNestedArray(dstArr[currentSlice], sourceArr, shape.slice(1), selection.slice(1));
        return;
    }
    const [from, _to, step, outputSize] = currentSlice;
    if (shape.length === 1) {
        if (step === 1) {
            dstArr.set(sourceArr, from);
        }
        else {
            for (let i = 0; i < outputSize; i++) {
                dstArr[from + i * step] = (sourceArr)[i];
            }
        }
        return;
    }
    for (let i = 0; i < outputSize; i++) {
        _setNestedArray(dstArr[from + i * step], sourceArr[i], shape.slice(1), selection.slice(1));
    }
}
function _setNestedArrayToScalar(dstArr, value, shape, selection) {
    const currentSlice = selection[0];
    const [from, to, step, outputSize] = currentSlice;
    if (shape.length === 1) {
        if (step === 1) {
            dstArr.fill(value, from, to);
        }
        else {
            for (let i = 0; i < outputSize; i++) {
                dstArr[from + i * step] = value;
            }
        }
        return;
    }
    for (let i = 0; i < outputSize; i++) {
        _setNestedArrayToScalar(dstArr[from + i * step], value, shape.slice(1), selection.slice(1));
    }
}
function flattenNestedArray(arr, shape, constr) {
    if (constr === undefined) {
        constr = getNestedArrayConstructor(arr);
    }
    const size = shape.reduce((x, y) => x * y, 1);
    const outArr = new constr(size);
    _flattenNestedArray(arr, shape, outArr, 0);
    return outArr;
}
function _flattenNestedArray(arr, shape, outArr, offset) {
    if (shape.length === 1) {
        // This is only ever reached if called with rank 1 shape, never reached through recursion.
        // We just slice set the array directly from one level above to save some function calls.
        outArr.set(arr, offset);
        return;
    }
    if (shape.length === 2) {
        for (let i = 0; i < shape[0]; i++) {
            outArr.set(arr[i], offset + shape[1] * i);
        }
        return arr;
    }
    const nextShape = shape.slice(1);
    // Small optimization possible here: this can be precomputed for different levels of depth and passed on.
    const mult = nextShape.reduce((x, y) => x * y, 1);
    for (let i = 0; i < shape[0]; i++) {
        _flattenNestedArray(arr[i], nextShape, outArr, offset + mult * i);
    }
    return arr;
}

class NestedArray {
    constructor(data, shape, dtype) {
        const dataIsTypedArray = data !== null && !!data.BYTES_PER_ELEMENT;
        if (shape === undefined) {
            if (!dataIsTypedArray) {
                throw new ValueError("Shape argument is required unless you pass in a TypedArray");
            }
            shape = [data.length];
        }
        if (dtype === undefined) {
            if (!dataIsTypedArray) {
                throw new ValueError("Dtype argument is required unless you pass in a TypedArray");
            }
            dtype = getTypedArrayDtypeString(data);
        }
        shape = normalizeShape(shape);
        this.shape = shape;
        this.dtype = dtype;
        if (dataIsTypedArray && shape.length !== 1) {
            data = data.buffer;
        }
        // Zero dimension array.. they are a bit weirdly represented now, they will only ever occur internally
        if (this.shape.length === 0) {
            this.data = new (getTypedArrayCtr(dtype))(1);
        }
        else if (
        // tslint:disable-next-line: strict-type-predicates
        (IS_NODE && Buffer.isBuffer(data))
            || isArrayBufferLike(data)
            || data === null) {
            // Create from ArrayBuffer or Buffer
            const numShapeElements = shape.reduce((x, y) => x * y, 1);
            if (data === null) {
                data = new ArrayBuffer(numShapeElements * parseInt(dtype[dtype.length - 1], 10));
            }
            const numDataElements = data.byteLength / parseInt(dtype[dtype.length - 1], 10);
            if (numShapeElements !== numDataElements) {
                throw new Error(`Buffer has ${numDataElements} of dtype ${dtype}, shape is too large or small ${shape} (flat=${numShapeElements})`);
            }
            const typeConstructor = getTypedArrayCtr(dtype);
            this.data = createNestedArray(data, typeConstructor, shape);
        }
        else {
            this.data = data;
        }
    }
    get(selection) {
        const [sliceResult, outShape] = sliceNestedArray(this.data, this.shape, selection);
        if (outShape.length === 0) {
            return sliceResult;
        }
        else {
            return new NestedArray(sliceResult, outShape, this.dtype);
        }
    }
    set(selection = null, value) {
        if (selection === null) {
            selection = [slice$1(null)];
        }
        if (typeof value === "number") {
            if (this.shape.length === 0) {
                // Zero dimension array..
                this.data[0] = value;
            }
            else {
                setNestedArrayToScalar(this.data, value, this.shape, selection);
            }
        }
        else {
            setNestedArray(this.data, value.data, this.shape, value.shape, selection);
        }
    }
    flatten() {
        if (this.shape.length === 1) {
            return this.data;
        }
        return flattenNestedArray(this.data, this.shape, getTypedArrayCtr(this.dtype));
    }
    /**
     * Currently only supports a single integer as the size, TODO: support start, stop, step.
     */
    static arange(size, dtype = "<i4") {
        const constr = getTypedArrayCtr(dtype);
        const data = rangeTypedArray([size], constr);
        return new NestedArray(data, [size], dtype);
    }
}
/**
 * Creates a TypedArray with values 0 through N where N is the product of the shape.
 */
function rangeTypedArray(shape, tContructor) {
    const size = shape.reduce((x, y) => x * y, 1);
    const data = new tContructor(size);
    data.set([...Array(size).keys()]); // Sets range 0,1,2,3,4,5
    return data;
}
/**
 * Creates multi-dimensional (rank > 1) array given input data and shape recursively.
 * What it does is create a Array<Array<...<Array<Uint8Array>>> or some other typed array.
 * This is for internal use, there should be no need to call this from user code.
 * @param data a buffer containing the data for this array.
 * @param t constructor for the datatype of choice
 * @param shape list of numbers describing the size in each dimension
 * @param offset in bytes for this dimension
 */
function createNestedArray(data, t, shape, offset = 0) {
    if (shape.length === 1) {
        // This is only ever reached if called with rank 1 shape, never reached through recursion.
        // We just slice set the array directly from one level above to save some function calls.
        return new t(data.slice(offset, offset + shape[0] * t.BYTES_PER_ELEMENT));
    }
    const arr = new Array(shape[0]);
    if (shape.length === 2) {
        for (let i = 0; i < shape[0]; i++) {
            arr[i] = new t(data.slice(offset + shape[1] * i * t.BYTES_PER_ELEMENT, offset + shape[1] * (i + 1) * t.BYTES_PER_ELEMENT));
        }
        return arr;
    }
    const nextShape = shape.slice(1);
    // Small optimization possible here: this can be precomputed for different levels of depth and passed on.
    const mult = nextShape.reduce((x, y) => x * y, 1);
    for (let i = 0; i < shape[0]; i++) {
        arr[i] = createNestedArray(data, t, nextShape, offset + mult * i * t.BYTES_PER_ELEMENT);
    }
    return arr;
}

function setRawArrayToScalar(dstArr, dstStrides, dstShape, dstSelection, value) {
    // This translates "...", ":", null, etc into a list of slices.
    const normalizedSelection = normalizeArraySelection(dstSelection, dstShape, true);
    const [sliceIndices] = selectionToSliceIndices(normalizedSelection, dstShape);
    // Above we force the results to be SliceIndicesIndices only, without integer selections making this cast is safe.
    _setRawArrayToScalar(value, dstArr, dstStrides, sliceIndices);
}
function setRawArray(dstArr, dstStrides, dstShape, dstSelection, sourceArr, sourceStrides, sourceShape) {
    // This translates "...", ":", null, etc into a list of slices.
    const normalizedDstSelection = normalizeArraySelection(dstSelection, dstShape, false);
    const [dstSliceIndices, outShape] = selectionToSliceIndices(normalizedDstSelection, dstShape);
    // TODO: replace with non stringify equality check
    if (JSON.stringify(outShape) !== JSON.stringify(sourceShape)) {
        throw new ValueError(`Shape mismatch in target and source RawArray: ${outShape} and ${sourceShape}`);
    }
    _setRawArray(dstArr, dstStrides, dstSliceIndices, sourceArr, sourceStrides);
}
function setRawArrayFromChunkItem(dstArr, dstStrides, dstShape, dstSelection, sourceArr, sourceStrides, sourceShape, sourceSelection) {
    // This translates "...", ":", null, etc into a list of slices.
    const normalizedDstSelection = normalizeArraySelection(dstSelection, dstShape, true);
    // Above we force the results to be dstSliceIndices only, without integer selections making this cast is safe.
    const [dstSliceIndices] = selectionToSliceIndices(normalizedDstSelection, dstShape);
    const normalizedSourceSelection = normalizeArraySelection(sourceSelection, sourceShape, false);
    const [sourceSliceIndicies] = selectionToSliceIndices(normalizedSourceSelection, sourceShape);
    // TODO check to ensure chunk and dest selection are same shape?
    // As is, this only gets called in ZarrArray.getRaw where this condition should be ensured, and check might hinder performance.
    _setRawArrayFromChunkItem(dstArr, dstStrides, dstSliceIndices, sourceArr, sourceStrides, sourceSliceIndicies);
}
function _setRawArrayToScalar(value, dstArr, dstStrides, dstSliceIndices) {
    const [currentDstSlice, ...nextDstSliceIndices] = dstSliceIndices;
    const [currentDstStride, ...nextDstStrides] = dstStrides;
    const [from, _to, step, outputSize] = currentDstSlice;
    if (dstStrides.length === 1) {
        if (step === 1 && currentDstStride === 1) {
            dstArr.fill(value, from, from + outputSize);
        }
        else {
            for (let i = 0; i < outputSize; i++) {
                dstArr[currentDstStride * (from + (step * i))] = value;
            }
        }
        return;
    }
    for (let i = 0; i < outputSize; i++) {
        _setRawArrayToScalar(value, dstArr.subarray(currentDstStride * (from + (step * i))), nextDstStrides, nextDstSliceIndices);
    }
}
function _setRawArray(dstArr, dstStrides, dstSliceIndices, sourceArr, sourceStrides) {
    if (dstSliceIndices.length === 0) {
        dstArr.set(sourceArr);
        return;
    }
    const [currentDstSlice, ...nextDstSliceIndices] = dstSliceIndices;
    const [currentDstStride, ...nextDstStrides] = dstStrides;
    // This dimension is squeezed.
    if (typeof currentDstSlice === "number") {
        _setRawArray(dstArr.subarray(currentDstSlice * currentDstStride), nextDstStrides, nextDstSliceIndices, sourceArr, sourceStrides);
        return;
    }
    const [currentSourceStride, ...nextSourceStrides] = sourceStrides;
    const [from, _to, step, outputSize] = currentDstSlice;
    if (dstStrides.length === 1) {
        if (step === 1 && currentDstStride === 1 && currentSourceStride === 1) {
            dstArr.set(sourceArr.subarray(0, outputSize), from);
        }
        else {
            for (let i = 0; i < outputSize; i++) {
                dstArr[currentDstStride * (from + (step * i))] = sourceArr[currentSourceStride * i];
            }
        }
        return;
    }
    for (let i = 0; i < outputSize; i++) {
        // Apply strides as above, using both destination and source-specific strides.
        _setRawArray(dstArr.subarray(currentDstStride * (from + (i * step))), nextDstStrides, nextDstSliceIndices, sourceArr.subarray(currentSourceStride * i), nextSourceStrides);
    }
}
function _setRawArrayFromChunkItem(dstArr, dstStrides, dstSliceIndices, sourceArr, sourceStrides, sourceSliceIndices) {
    if (sourceSliceIndices.length === 0) {
        // Case when last source dimension is squeezed
        dstArr.set(sourceArr.subarray(0, dstArr.length));
        return;
    }
    // Get current indicies and strides for both destination and source arrays
    const [currentDstSlice, ...nextDstSliceIndices] = dstSliceIndices;
    const [currentSourceSlice, ...nextSourceSliceIndices] = sourceSliceIndices;
    const [currentDstStride, ...nextDstStrides] = dstStrides;
    const [currentSourceStride, ...nextSourceStrides] = sourceStrides;
    // This source dimension is squeezed
    if (typeof currentSourceSlice === "number") {
        /*
        Sets dimension offset for squeezed dimension.

        Ex. if 0th dimension is squeezed to 2nd index (numpy : arr[2,i])

            sourceArr[stride[0]* 2 + i] --> sourceArr.subarray(stride[0] * 2)[i] (sourceArr[i] in next call)

        Thus, subsequent squeezed dims are appended to the source offset.
        */
        _setRawArrayFromChunkItem(
        // Don't update destination offset/slices, just source
        dstArr, dstStrides, dstSliceIndices, sourceArr.subarray(currentSourceStride * currentSourceSlice), nextSourceStrides, nextSourceSliceIndices);
        return;
    }
    const [from, _to, step, outputSize] = currentDstSlice; // just need start and size
    const [sfrom, _sto, sstep, _soutputSize] = currentSourceSlice; // Will always be subset of dst, so don't need output size just start
    if (dstStrides.length === 1 && sourceStrides.length === 1) {
        if (step === 1 && currentDstStride === 1 && sstep === 1 && currentSourceStride === 1) {
            dstArr.set(sourceArr.subarray(sfrom, sfrom + outputSize), from);
        }
        else {
            for (let i = 0; i < outputSize; i++) {
                dstArr[currentDstStride * (from + (step * i))] = sourceArr[currentSourceStride * (sfrom + (sstep * i))];
            }
        }
        return;
    }
    for (let i = 0; i < outputSize; i++) {
        // Apply strides as above, using both destination and source-specific strides.
        _setRawArrayFromChunkItem(dstArr.subarray(currentDstStride * (from + (i * step))), nextDstStrides, nextDstSliceIndices, sourceArr.subarray(currentSourceStride * (sfrom + (i * sstep))), nextSourceStrides, nextSourceSliceIndices);
    }
}

class RawArray {
    constructor(data, shape, dtype, strides) {
        const dataIsTypedArray = data !== null && !!data.BYTES_PER_ELEMENT;
        if (shape === undefined) {
            if (!dataIsTypedArray) {
                throw new ValueError("Shape argument is required unless you pass in a TypedArray");
            }
            shape = [data.length];
        }
        shape = normalizeShape(shape);
        if (dtype === undefined) {
            if (!dataIsTypedArray) {
                throw new ValueError("Dtype argument is required unless you pass in a TypedArray");
            }
            dtype = getTypedArrayDtypeString(data);
        }
        if (strides === undefined) {
            strides = getStrides(shape);
        }
        this.shape = shape;
        this.dtype = dtype;
        this.strides = strides;
        if (dataIsTypedArray && shape.length !== 1) {
            data = data.buffer;
        }
        // Zero dimension array.. they are a bit weirdly represented now, they will only ever occur internally
        if (this.shape.length === 0) {
            this.data = new (getTypedArrayCtr(dtype))(1);
        }
        else if (
        // tslint:disable-next-line: strict-type-predicates
        (IS_NODE && Buffer.isBuffer(data))
            || isArrayBufferLike(data)
            || data === null) {
            // Create from ArrayBuffer or Buffer
            const numShapeElements = shape.reduce((x, y) => x * y, 1);
            if (data === null) {
                data = new ArrayBuffer(numShapeElements * parseInt(dtype[dtype.length - 1], 10));
            }
            const numDataElements = data.byteLength / parseInt(dtype[dtype.length - 1], 10);
            if (numShapeElements !== numDataElements) {
                throw new Error(`Buffer has ${numDataElements} of dtype ${dtype}, shape is too large or small ${shape} (flat=${numShapeElements})`);
            }
            const typeConstructor = getTypedArrayCtr(dtype);
            this.data = new typeConstructor(data);
        }
        else {
            this.data = data;
        }
    }
    set(selection = null, value, chunkSelection) {
        if (selection === null) {
            selection = [slice$1(null)];
        }
        if (typeof value === "number") {
            if (this.shape.length === 0) {
                // Zero dimension array..
                this.data[0] = value;
            }
            else {
                setRawArrayToScalar(this.data, this.strides, this.shape, selection, value);
            }
        }
        else if (value instanceof RawArray && chunkSelection) {
            // Copy directly from decoded chunk to destination array
            setRawArrayFromChunkItem(this.data, this.strides, this.shape, selection, value.data, value.strides, value.shape, chunkSelection);
        }
        else {
            setRawArray(this.data, this.strides, this.shape, selection, value.data, value.strides, value.shape);
        }
    }
}

var eventemitter3 = {exports: {}};

(function (module) {

var has = Object.prototype.hasOwnProperty
  , prefix = '~';

/**
 * Constructor to create a storage for our `EE` objects.
 * An `Events` instance is a plain object whose properties are event names.
 *
 * @constructor
 * @private
 */
function Events() {}

//
// We try to not inherit from `Object.prototype`. In some engines creating an
// instance in this way is faster than calling `Object.create(null)` directly.
// If `Object.create(null)` is not supported we prefix the event names with a
// character to make sure that the built-in object properties are not
// overridden or used as an attack vector.
//
if (Object.create) {
  Events.prototype = Object.create(null);

  //
  // This hack is needed because the `__proto__` property is still inherited in
  // some old browsers like Android 4, iPhone 5.1, Opera 11 and Safari 5.
  //
  if (!new Events().__proto__) prefix = false;
}

/**
 * Representation of a single event listener.
 *
 * @param {Function} fn The listener function.
 * @param {*} context The context to invoke the listener with.
 * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
 * @constructor
 * @private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Add a listener for a given event.
 *
 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} context The context to invoke the listener with.
 * @param {Boolean} once Specify if the listener is a one-time listener.
 * @returns {EventEmitter}
 * @private
 */
function addListener(emitter, event, fn, context, once) {
  if (typeof fn !== 'function') {
    throw new TypeError('The listener must be a function');
  }

  var listener = new EE(fn, context || emitter, once)
    , evt = prefix ? prefix + event : event;

  if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
  else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
  else emitter._events[evt] = [emitter._events[evt], listener];

  return emitter;
}

/**
 * Clear event by name.
 *
 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
 * @param {(String|Symbol)} evt The Event name.
 * @private
 */
function clearEvent(emitter, evt) {
  if (--emitter._eventsCount === 0) emitter._events = new Events();
  else delete emitter._events[evt];
}

/**
 * Minimal `EventEmitter` interface that is molded against the Node.js
 * `EventEmitter` interface.
 *
 * @constructor
 * @public
 */
function EventEmitter() {
  this._events = new Events();
  this._eventsCount = 0;
}

/**
 * Return an array listing the events for which the emitter has registered
 * listeners.
 *
 * @returns {Array}
 * @public
 */
EventEmitter.prototype.eventNames = function eventNames() {
  var names = []
    , events
    , name;

  if (this._eventsCount === 0) return names;

  for (name in (events = this._events)) {
    if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
  }

  if (Object.getOwnPropertySymbols) {
    return names.concat(Object.getOwnPropertySymbols(events));
  }

  return names;
};

/**
 * Return the listeners registered for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Array} The registered listeners.
 * @public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  var evt = prefix ? prefix + event : event
    , handlers = this._events[evt];

  if (!handlers) return [];
  if (handlers.fn) return [handlers.fn];

  for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
    ee[i] = handlers[i].fn;
  }

  return ee;
};

/**
 * Return the number of listeners listening to a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Number} The number of listeners.
 * @public
 */
EventEmitter.prototype.listenerCount = function listenerCount(event) {
  var evt = prefix ? prefix + event : event
    , listeners = this._events[evt];

  if (!listeners) return 0;
  if (listeners.fn) return 1;
  return listeners.length;
};

/**
 * Calls each of the listeners registered for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Boolean} `true` if the event had listeners, else `false`.
 * @public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  var evt = prefix ? prefix + event : event;

  if (!this._events[evt]) return false;

  var listeners = this._events[evt]
    , len = arguments.length
    , args
    , i;

  if (listeners.fn) {
    if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

    switch (len) {
      case 1: return listeners.fn.call(listeners.context), true;
      case 2: return listeners.fn.call(listeners.context, a1), true;
      case 3: return listeners.fn.call(listeners.context, a1, a2), true;
      case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
      case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
      case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    listeners.fn.apply(listeners.context, args);
  } else {
    var length = listeners.length
      , j;

    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        case 4: listeners[i].fn.call(listeners[i].context, a1, a2, a3); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Add a listener for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} [context=this] The context to invoke the listener with.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  return addListener(this, event, fn, context, false);
};

/**
 * Add a one-time listener for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} [context=this] The context to invoke the listener with.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  return addListener(this, event, fn, context, true);
};

/**
 * Remove the listeners of a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn Only remove the listeners that match this function.
 * @param {*} context Only remove the listeners that have this context.
 * @param {Boolean} once Only remove one-time listeners.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
  var evt = prefix ? prefix + event : event;

  if (!this._events[evt]) return this;
  if (!fn) {
    clearEvent(this, evt);
    return this;
  }

  var listeners = this._events[evt];

  if (listeners.fn) {
    if (
      listeners.fn === fn &&
      (!once || listeners.once) &&
      (!context || listeners.context === context)
    ) {
      clearEvent(this, evt);
    }
  } else {
    for (var i = 0, events = [], length = listeners.length; i < length; i++) {
      if (
        listeners[i].fn !== fn ||
        (once && !listeners[i].once) ||
        (context && listeners[i].context !== context)
      ) {
        events.push(listeners[i]);
      }
    }

    //
    // Reset the array, or remove it completely if we have no more listeners.
    //
    if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
    else clearEvent(this, evt);
  }

  return this;
};

/**
 * Remove all listeners, or those of the specified event.
 *
 * @param {(String|Symbol)} [event] The event name.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  var evt;

  if (event) {
    evt = prefix ? prefix + event : event;
    if (this._events[evt]) clearEvent(this, evt);
  } else {
    this._events = new Events();
    this._eventsCount = 0;
  }

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// Expose the prefix.
//
EventEmitter.prefixed = prefix;

//
// Allow `EventEmitter` to be imported as module namespace.
//
EventEmitter.EventEmitter = EventEmitter;

//
// Expose the module.
//
{
  module.exports = EventEmitter;
}
}(eventemitter3));

var EventEmitter = eventemitter3.exports;

class TimeoutError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TimeoutError';
	}
}

function pTimeout(promise, milliseconds, fallback, options) {
	let timer;
	const cancelablePromise = new Promise((resolve, reject) => {
		if (typeof milliseconds !== 'number' || milliseconds < 0) {
			throw new TypeError('Expected `milliseconds` to be a positive number');
		}

		if (milliseconds === Number.POSITIVE_INFINITY) {
			resolve(promise);
			return;
		}

		options = {
			customTimers: {setTimeout, clearTimeout},
			...options
		};

		timer = options.customTimers.setTimeout.call(undefined, () => {
			if (typeof fallback === 'function') {
				try {
					resolve(fallback());
				} catch (error) {
					reject(error);
				}

				return;
			}

			const message = typeof fallback === 'string' ? fallback : `Promise timed out after ${milliseconds} milliseconds`;
			const timeoutError = fallback instanceof Error ? fallback : new TimeoutError(message);

			if (typeof promise.cancel === 'function') {
				promise.cancel();
			}

			reject(timeoutError);
		}, milliseconds);

		(async () => {
			try {
				resolve(await promise);
			} catch (error) {
				reject(error);
			} finally {
				options.customTimers.clearTimeout.call(undefined, timer);
			}
		})();
	});

	cancelablePromise.clear = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	return cancelablePromise;
}

// Port of lower_bound from https://en.cppreference.com/w/cpp/algorithm/lower_bound
// Used to compute insertion index to keep queue sorted after insertion
function lowerBound(array, value, comparator) {
    let first = 0;
    let count = array.length;
    while (count > 0) {
        const step = Math.trunc(count / 2);
        let it = first + step;
        if (comparator(array[it], value) <= 0) {
            first = ++it;
            count -= step + 1;
        }
        else {
            count = step;
        }
    }
    return first;
}

class PriorityQueue {
    constructor() {
        Object.defineProperty(this, "_queue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    enqueue(run, options) {
        var _a;
        options = {
            priority: 0,
            ...options
        };
        const element = {
            priority: options.priority,
            run
        };
        if (this.size && ((_a = this._queue[this.size - 1]) === null || _a === void 0 ? void 0 : _a.priority) >= options.priority) {
            this._queue.push(element);
            return;
        }
        const index = lowerBound(this._queue, element, (a, b) => b.priority - a.priority);
        this._queue.splice(index, 0, element);
    }
    dequeue() {
        const item = this._queue.shift();
        return item === null || item === void 0 ? void 0 : item.run;
    }
    filter(options) {
        return this._queue.filter((element) => element.priority === options.priority).map((element) => element.run);
    }
    get size() {
        return this._queue.length;
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const empty$1 = () => { };
const timeoutError = new TimeoutError();
/**
Promise queue with concurrency control.
*/
class PQueue extends EventEmitter {
    constructor(options) {
        var _a, _b, _c, _d;
        super();
        Object.defineProperty(this, "_carryoverConcurrencyCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_isIntervalIgnored", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_intervalCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_intervalCap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_interval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_intervalEnd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_intervalId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_timeoutId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_queue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_queueClass", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_pendingCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        // The `!` is needed because of https://github.com/microsoft/TypeScript/issues/32194
        Object.defineProperty(this, "_concurrency", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_isPaused", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_resolveEmpty", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: empty$1
        });
        Object.defineProperty(this, "_resolveIdle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: empty$1
        });
        Object.defineProperty(this, "_timeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_throwOnTimeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        options = {
            carryoverConcurrencyCount: false,
            intervalCap: Number.POSITIVE_INFINITY,
            interval: 0,
            concurrency: Number.POSITIVE_INFINITY,
            autoStart: true,
            queueClass: PriorityQueue,
            ...options
        };
        if (!(typeof options.intervalCap === 'number' && options.intervalCap >= 1)) {
            throw new TypeError(`Expected \`intervalCap\` to be a number from 1 and up, got \`${(_b = (_a = options.intervalCap) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : ''}\` (${typeof options.intervalCap})`);
        }
        if (options.interval === undefined || !(Number.isFinite(options.interval) && options.interval >= 0)) {
            throw new TypeError(`Expected \`interval\` to be a finite number >= 0, got \`${(_d = (_c = options.interval) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ''}\` (${typeof options.interval})`);
        }
        this._carryoverConcurrencyCount = options.carryoverConcurrencyCount;
        this._isIntervalIgnored = options.intervalCap === Number.POSITIVE_INFINITY || options.interval === 0;
        this._intervalCap = options.intervalCap;
        this._interval = options.interval;
        this._queue = new options.queueClass();
        this._queueClass = options.queueClass;
        this.concurrency = options.concurrency;
        this._timeout = options.timeout;
        this._throwOnTimeout = options.throwOnTimeout === true;
        this._isPaused = options.autoStart === false;
    }
    get _doesIntervalAllowAnother() {
        return this._isIntervalIgnored || this._intervalCount < this._intervalCap;
    }
    get _doesConcurrentAllowAnother() {
        return this._pendingCount < this._concurrency;
    }
    _next() {
        this._pendingCount--;
        this._tryToStartAnother();
        this.emit('next');
    }
    _resolvePromises() {
        this._resolveEmpty();
        this._resolveEmpty = empty$1;
        if (this._pendingCount === 0) {
            this._resolveIdle();
            this._resolveIdle = empty$1;
            this.emit('idle');
        }
    }
    _onResumeInterval() {
        this._onInterval();
        this._initializeIntervalIfNeeded();
        this._timeoutId = undefined;
    }
    _isIntervalPaused() {
        const now = Date.now();
        if (this._intervalId === undefined) {
            const delay = this._intervalEnd - now;
            if (delay < 0) {
                // Act as the interval was done
                // We don't need to resume it here because it will be resumed on line 160
                this._intervalCount = (this._carryoverConcurrencyCount) ? this._pendingCount : 0;
            }
            else {
                // Act as the interval is pending
                if (this._timeoutId === undefined) {
                    this._timeoutId = setTimeout(() => {
                        this._onResumeInterval();
                    }, delay);
                }
                return true;
            }
        }
        return false;
    }
    _tryToStartAnother() {
        if (this._queue.size === 0) {
            // We can clear the interval ("pause")
            // Because we can redo it later ("resume")
            if (this._intervalId) {
                clearInterval(this._intervalId);
            }
            this._intervalId = undefined;
            this._resolvePromises();
            return false;
        }
        if (!this._isPaused) {
            const canInitializeInterval = !this._isIntervalPaused();
            if (this._doesIntervalAllowAnother && this._doesConcurrentAllowAnother) {
                const job = this._queue.dequeue();
                if (!job) {
                    return false;
                }
                this.emit('active');
                job();
                if (canInitializeInterval) {
                    this._initializeIntervalIfNeeded();
                }
                return true;
            }
        }
        return false;
    }
    _initializeIntervalIfNeeded() {
        if (this._isIntervalIgnored || this._intervalId !== undefined) {
            return;
        }
        this._intervalId = setInterval(() => {
            this._onInterval();
        }, this._interval);
        this._intervalEnd = Date.now() + this._interval;
    }
    _onInterval() {
        if (this._intervalCount === 0 && this._pendingCount === 0 && this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = undefined;
        }
        this._intervalCount = this._carryoverConcurrencyCount ? this._pendingCount : 0;
        this._processQueue();
    }
    /**
    Executes all queued functions until it reaches the limit.
    */
    _processQueue() {
        // eslint-disable-next-line no-empty
        while (this._tryToStartAnother()) { }
    }
    get concurrency() {
        return this._concurrency;
    }
    set concurrency(newConcurrency) {
        if (!(typeof newConcurrency === 'number' && newConcurrency >= 1)) {
            throw new TypeError(`Expected \`concurrency\` to be a number from 1 and up, got \`${newConcurrency}\` (${typeof newConcurrency})`);
        }
        this._concurrency = newConcurrency;
        this._processQueue();
    }
    /**
    Adds a sync or async task to the queue. Always returns a promise.
    */
    async add(fn, options = {}) {
        return new Promise((resolve, reject) => {
            const run = async () => {
                this._pendingCount++;
                this._intervalCount++;
                try {
                    const operation = (this._timeout === undefined && options.timeout === undefined) ? fn() : pTimeout(Promise.resolve(fn()), (options.timeout === undefined ? this._timeout : options.timeout), () => {
                        if (options.throwOnTimeout === undefined ? this._throwOnTimeout : options.throwOnTimeout) {
                            reject(timeoutError);
                        }
                        return undefined;
                    });
                    const result = await operation;
                    resolve(result);
                    this.emit('completed', result);
                }
                catch (error) {
                    reject(error);
                    this.emit('error', error);
                }
                this._next();
            };
            this._queue.enqueue(run, options);
            this._tryToStartAnother();
            this.emit('add');
        });
    }
    /**
    Same as `.add()`, but accepts an array of sync or async functions.

    @returns A promise that resolves when all functions are resolved.
    */
    async addAll(functions, options) {
        return Promise.all(functions.map(async (function_) => this.add(function_, options)));
    }
    /**
    Start (or resume) executing enqueued tasks within concurrency limit. No need to call this if queue is not paused (via `options.autoStart = false` or by `.pause()` method.)
    */
    start() {
        if (!this._isPaused) {
            return this;
        }
        this._isPaused = false;
        this._processQueue();
        return this;
    }
    /**
    Put queue execution on hold.
    */
    pause() {
        this._isPaused = true;
    }
    /**
    Clear the queue.
    */
    clear() {
        this._queue = new this._queueClass();
    }
    /**
    Can be called multiple times. Useful if you for example add additional items at a later time.

    @returns A promise that settles when the queue becomes empty.
    */
    async onEmpty() {
        // Instantly resolve if the queue is empty
        if (this._queue.size === 0) {
            return;
        }
        return new Promise(resolve => {
            const existingResolve = this._resolveEmpty;
            this._resolveEmpty = () => {
                existingResolve();
                resolve();
            };
        });
    }
    /**
    @returns A promise that settles when the queue size is less than the given limit: `queue.size < limit`.

    If you want to avoid having the queue grow beyond a certain size you can `await queue.onSizeLessThan()` before adding a new item.

    Note that this only limits the number of items waiting to start. There could still be up to `concurrency` jobs already running that this call does not include in its calculation.
    */
    async onSizeLessThan(limit) {
        // Instantly resolve if the queue is empty.
        if (this._queue.size < limit) {
            return;
        }
        return new Promise(resolve => {
            const listener = () => {
                if (this._queue.size < limit) {
                    this.removeListener('next', listener);
                    resolve();
                }
            };
            this.on('next', listener);
        });
    }
    /**
    The difference with `.onEmpty` is that `.onIdle` guarantees that all work from the queue has finished. `.onEmpty` merely signals that the queue is empty, but it could mean that some promises haven't completed yet.

    @returns A promise that settles when the queue becomes empty, and all promises have completed; `queue.size === 0 && queue.pending === 0`.
    */
    async onIdle() {
        // Instantly resolve if none pending and if nothing else is queued
        if (this._pendingCount === 0 && this._queue.size === 0) {
            return;
        }
        return new Promise(resolve => {
            const existingResolve = this._resolveIdle;
            this._resolveIdle = () => {
                existingResolve();
                resolve();
            };
        });
    }
    /**
    Size of the queue, the number of queued items waiting to run.
    */
    get size() {
        return this._queue.size;
    }
    /**
    Size of the queue, filtered by the given options.

    For example, this can be used to find the number of items remaining in the queue with a specific priority level.
    */
    sizeBy(options) {
        // eslint-disable-next-line unicorn/no-array-callback-reference
        return this._queue.filter(options).length;
    }
    /**
    Number of running items (no longer in the queue).
    */
    get pending() {
        return this._pendingCount;
    }
    /**
    Whether the queue is currently paused.
    */
    get isPaused() {
        return this._isPaused;
    }
    get timeout() {
        return this._timeout;
    }
    /**
    Set the timeout for future operations.
    */
    set timeout(milliseconds) {
        this._timeout = milliseconds;
    }
}

class ZarrArray {
    /**
     * A `Store` providing the underlying storage for array chunks.
     */
    get chunkStore() {
        if (this._chunkStore) {
            return this._chunkStore;
        }
        return this.store;
    }
    /**
     * Array name following h5py convention.
     */
    get name() {
        if (this.path.length > 0) {
            if (this.path[0] !== "/") {
                return "/" + this.path;
            }
            return this.path;
        }
        return null;
    }
    /**
     * Final component of name.
     */
    get basename() {
        const name = this.name;
        if (name === null) {
            return null;
        }
        const parts = name.split("/");
        return parts[parts.length - 1];
    }
    /**
     * "A list of integers describing the length of each dimension of the array.
     */
    get shape() {
        // this.refreshMetadata();
        return this.meta.shape;
    }
    /**
     * A list of integers describing the length of each dimension of a chunk of the array.
     */
    get chunks() {
        return this.meta.chunks;
    }
    /**
     * Integer describing how many element a chunk contains
     */
    get chunkSize() {
        return this.chunks.reduce((x, y) => x * y, 1);
    }
    /**
     *  The NumPy data type.
     */
    get dtype() {
        return this.meta.dtype;
    }
    /**
     *  A value used for uninitialized portions of the array.
     */
    get fillValue() {
        const fillTypeValue = this.meta.fill_value;
        // TODO extract into function
        if (fillTypeValue === "NaN") {
            return NaN;
        }
        else if (fillTypeValue === "Infinity") {
            return Infinity;
        }
        else if (fillTypeValue === "-Infinity") {
            return -Infinity;
        }
        return this.meta.fill_value;
    }
    /**
     *  Number of dimensions.
     */
    get nDims() {
        return this.meta.shape.length;
    }
    /**
     *  The total number of elements in the array.
     */
    get size() {
        // this.refreshMetadata()
        return this.meta.shape.reduce((x, y) => x * y, 1);
    }
    get length() {
        return this.shape[0];
    }
    get _chunkDataShape() {
        if (this.shape.length === 0) {
            return [1];
        }
        else {
            const s = [];
            for (let i = 0; i < this.shape.length; i++) {
                s[i] = Math.ceil(this.shape[i] / this.chunks[i]);
            }
            return s;
        }
    }
    /**
     * A tuple of integers describing the number of chunks along each
     * dimension of the array.
     */
    get chunkDataShape() {
        // this.refreshMetadata();
        return this._chunkDataShape;
    }
    /**
     * Total number of chunks.
     */
    get numChunks() {
        // this.refreshMetadata();
        return this.chunkDataShape.reduce((x, y) => x * y, 1);
    }
    /**
     * Instantiate an array from an initialized store.
     * @param store Array store, already initialized.
     * @param path Storage path.
     * @param readOnly True if array should be protected against modification.
     * @param chunkStore Separate storage for chunks. If not provided, `store` will be used for storage of both chunks and metadata.
     * @param cacheMetadata If true (default), array configuration metadata will be cached for the lifetime of the object.
     * If false, array metadata will be reloaded prior to all data access and modification operations (may incur overhead depending on storage and data access pattern).
     * @param cacheAttrs If true (default), user attributes will be cached for attribute read operations.
     * If false, user attributes are reloaded from the store prior to all attribute read operations.
     */
    static async create(store, path = null, readOnly = false, chunkStore = null, cacheMetadata = true, cacheAttrs = true) {
        const metadata = await this.loadMetadataForConstructor(store, path);
        return new ZarrArray(store, path, metadata, readOnly, chunkStore, cacheMetadata, cacheAttrs);
    }
    static async loadMetadataForConstructor(store, path) {
        try {
            path = normalizeStoragePath(path);
            const keyPrefix = pathToPrefix(path);
            const metaStoreValue = await store.getItem(keyPrefix + ARRAY_META_KEY);
            return parseMetadata(metaStoreValue);
        }
        catch (error) {
            if (await containsGroup(store, path)) {
                throw new ContainsGroupError(path !== null && path !== void 0 ? path : '');
            }
            throw new Error("Failed to load metadata for ZarrArray:" + error.toString());
        }
    }
    /**
     * Instantiate an array from an initialized store.
     * @param store Array store, already initialized.
     * @param path Storage path.
     * @param metadata The initial value for the metadata
     * @param readOnly True if array should be protected against modification.
     * @param chunkStore Separate storage for chunks. If not provided, `store` will be used for storage of both chunks and metadata.
     * @param cacheMetadata If true (default), array configuration metadata will be cached for the lifetime of the object.
     * If false, array metadata will be reloaded prior to all data access and modification operations (may incur overhead depending on storage and data access pattern).
     * @param cacheAttrs If true (default), user attributes will be cached for attribute read operations.
     * If false, user attributes are reloaded from the store prior to all attribute read operations.
     */
    constructor(store, path = null, metadata, readOnly = false, chunkStore = null, cacheMetadata = true, cacheAttrs = true) {
        // N.B., expect at this point store is fully initialized with all
        // configuration metadata fully specified and normalized
        this.store = store;
        this._chunkStore = chunkStore;
        this.path = normalizeStoragePath(path);
        this.keyPrefix = pathToPrefix(this.path);
        this.readOnly = readOnly;
        this.cacheMetadata = cacheMetadata;
        this.cacheAttrs = cacheAttrs;
        this.meta = metadata;
        if (this.meta.compressor === undefined) {
            this.meta.compressor = null;
        }
        if (this.meta.compressor !== null) {
            this.compressor = getCodec(this.meta.compressor);
        }
        else {
            this.compressor = null;
        }
        const attrKey = this.keyPrefix + ATTRS_META_KEY;
        this.attrs = new Attributes(this.store, attrKey, this.readOnly, cacheAttrs);
    }
    /**
     * (Re)load metadata from store
     */
    async reloadMetadata() {
        const metaKey = this.keyPrefix + ARRAY_META_KEY;
        const metaStoreValue = this.store.getItem(metaKey);
        this.meta = parseMetadata(await metaStoreValue);
        return this.meta;
    }
    async refreshMetadata() {
        if (!this.cacheMetadata) {
            await this.reloadMetadata();
        }
    }
    get(selection = null, opts = {}) {
        return this.getBasicSelection(selection, false, opts);
    }
    getRaw(selection = null, opts = {}) {
        return this.getBasicSelection(selection, true, opts);
    }
    async getBasicSelection(selection, asRaw = false, { concurrencyLimit = 10, progressCallback, storeOptions } = {}) {
        // Refresh metadata
        if (!this.cacheMetadata) {
            await this.reloadMetadata();
        }
        // Check fields (TODO?)
        if (this.shape.length === 0) {
            throw new Error("Shape [] indexing is not supported yet");
        }
        else {
            return this.getBasicSelectionND(selection, asRaw, concurrencyLimit, progressCallback, storeOptions);
        }
    }
    getBasicSelectionND(selection, asRaw, concurrencyLimit, progressCallback, storeOptions) {
        const indexer = new BasicIndexer(selection, this);
        return this.getSelection(indexer, asRaw, concurrencyLimit, progressCallback, storeOptions);
    }
    async getSelection(indexer, asRaw, concurrencyLimit, progressCallback, storeOptions) {
        // We iterate over all chunks which overlap the selection and thus contain data
        // that needs to be extracted. Each chunk is processed in turn, extracting the
        // necessary data and storing into the correct location in the output array.
        // N.B., it is an important optimisation that we only visit chunks which overlap
        // the selection. This minimises the number of iterations in the main for loop.
        // check fields are sensible (TODO?)
        const outDtype = this.dtype;
        const outShape = indexer.shape;
        const outSize = indexer.shape.reduce((x, y) => x * y, 1);
        if (asRaw && (outSize === this.chunkSize)) {
            // Optimization: if output strided array _is_ chunk exactly,
            // decode directly as new TypedArray and return
            const itr = indexer.iter();
            const proj = itr.next(); // ensure there is only one projection
            if (proj.done === false && itr.next().done === true) {
                const chunkProjection = proj.value;
                const out = await this.decodeDirectToRawArray(chunkProjection, outShape, outSize);
                return out;
            }
        }
        const out = asRaw
            ? new RawArray(null, outShape, outDtype)
            : new NestedArray(null, outShape, outDtype);
        if (outSize === 0) {
            return out;
        }
        // create promise queue with concurrency control
        const queue = new PQueue({ concurrency: concurrencyLimit });
        const allTasks = [];
        if (progressCallback) {
            let progress = 0;
            let queueSize = 0;
            for (const _ of indexer.iter())
                queueSize += 1;
            progressCallback({ progress: 0, queueSize: queueSize });
            for (const proj of indexer.iter()) {
                allTasks.push(queue.add(async () => {
                    await this.chunkGetItem(proj.chunkCoords, proj.chunkSelection, out, proj.outSelection, indexer.dropAxes, storeOptions);
                    progress += 1;
                    progressCallback({ progress: progress, queueSize: queueSize });
                }));
            }
        }
        else {
            for (const proj of indexer.iter()) {
                allTasks.push(queue.add(() => this.chunkGetItem(proj.chunkCoords, proj.chunkSelection, out, proj.outSelection, indexer.dropAxes, storeOptions)));
            }
        }
        // guarantees that all work on queue has finished and throws if any of the tasks errored.
        await Promise.all(allTasks);
        // Return scalar instead of zero-dimensional array.
        if (out.shape.length === 0) {
            return out.data[0];
        }
        return out;
    }
    /**
     * Obtain part or whole of a chunk.
     * @param chunkCoords Indices of the chunk.
     * @param chunkSelection Location of region within the chunk to extract.
     * @param out Array to store result in.
     * @param outSelection Location of region within output array to store results in.
     * @param dropAxes Axes to squeeze out of the chunk.
     */
    async chunkGetItem(chunkCoords, chunkSelection, out, outSelection, dropAxes, storeOptions) {
        if (chunkCoords.length !== this._chunkDataShape.length) {
            throw new ValueError(`Inconsistent shapes: chunkCoordsLength: ${chunkCoords.length}, cDataShapeLength: ${this.chunkDataShape.length}`);
        }
        const cKey = this.chunkKey(chunkCoords);
        try {
            const cdata = await this.chunkStore.getItem(cKey, storeOptions);
            const decodedChunk = await this.decodeChunk(cdata);
            if (out instanceof NestedArray) {
                if (isContiguousSelection(outSelection) && isTotalSlice(chunkSelection, this.chunks) && !this.meta.filters) {
                    // Optimization: we want the whole chunk, and the destination is
                    // contiguous, so we can decompress directly from the chunk
                    // into the destination array
                    // TODO check order
                    // TODO filters..
                    out.set(outSelection, this.toNestedArray(decodedChunk));
                    return;
                }
                // Decode chunk
                const chunk = this.toNestedArray(decodedChunk);
                const tmp = chunk.get(chunkSelection);
                if (dropAxes !== null) {
                    throw new Error("Drop axes is not supported yet");
                }
                out.set(outSelection, tmp);
            }
            else {
                /* RawArray
                Copies chunk by index directly into output. Doesn't matter if selection is contiguous
                since store/output are different shapes/strides.
                */
                out.set(outSelection, this.chunkBufferToRawArray(decodedChunk), chunkSelection);
            }
        }
        catch (error) {
            if (isKeyError(error)) {
                // fill with scalar if cKey doesn't exist in store
                if (this.fillValue !== null) {
                    out.set(outSelection, this.fillValue);
                }
            }
            else {
                // Different type of error - rethrow
                throw error;
            }
        }
    }
    async getRawChunk(chunkCoords, opts) {
        if (chunkCoords.length !== this.shape.length) {
            throw new Error(`Chunk coordinates ${chunkCoords.join(".")} do not correspond to shape ${this.shape}.`);
        }
        try {
            for (let i = 0; i < chunkCoords.length; i++) {
                const dimLength = Math.ceil(this.shape[i] / this.chunks[i]);
                chunkCoords[i] = normalizeIntegerSelection(chunkCoords[i], dimLength);
            }
        }
        catch (error) {
            if (error instanceof BoundsCheckError) {
                throw new BoundsCheckError(`index ${chunkCoords.join(".")} is out of bounds for shape: ${this.shape} and chunks ${this.chunks}`);
            }
            else {
                throw error;
            }
        }
        const cKey = this.chunkKey(chunkCoords);
        const cdata = this.chunkStore.getItem(cKey, opts === null || opts === void 0 ? void 0 : opts.storeOptions);
        const buffer = await this.decodeChunk(await cdata);
        const outShape = this.chunks.filter(d => d !== 1); // squeeze chunk dim if 1
        return new RawArray(buffer, outShape, this.dtype);
    }
    chunkKey(chunkCoords) {
        var _a;
        const sep = (_a = this.meta.dimension_separator) !== null && _a !== void 0 ? _a : ".";
        return this.keyPrefix + chunkCoords.join(sep);
    }
    ensureByteArray(chunkData) {
        if (typeof chunkData === "string") {
            return new Uint8Array(Buffer.from(chunkData).buffer);
        }
        return new Uint8Array(chunkData);
    }
    toTypedArray(buffer) {
        return new (getTypedArrayCtr(this.dtype))(buffer);
    }
    toNestedArray(data) {
        const buffer = this.ensureByteArray(data).buffer;
        return new NestedArray(buffer, this.chunks, this.dtype);
    }
    async decodeChunk(chunkData) {
        let bytes = this.ensureByteArray(chunkData);
        if (this.compressor !== null) {
            bytes = await (await this.compressor).decode(bytes);
        }
        if (this.dtype.includes('>')) {
            // Need to flip bytes for Javascript TypedArrays
            // We flip bytes in-place to avoid creating an extra copy of the decoded buffer.
            byteSwapInplace(this.toTypedArray(bytes.buffer));
        }
        if (this.meta.order === "F" && this.nDims > 1) {
            // We need to transpose the array, because this library only support C-order.
            const src = this.toTypedArray(bytes.buffer);
            const out = new (getTypedArrayCtr(this.dtype))(src.length);
            convertColMajorToRowMajor(src, out, this.chunks);
            return out.buffer;
        }
        // TODO filtering etc
        return bytes.buffer;
    }
    chunkBufferToRawArray(buffer) {
        return new RawArray(buffer, this.chunks, this.dtype);
    }
    async decodeDirectToRawArray({ chunkCoords }, outShape, outSize) {
        const cKey = this.chunkKey(chunkCoords);
        try {
            const cdata = await this.chunkStore.getItem(cKey);
            return new RawArray(await this.decodeChunk(cdata), outShape, this.dtype);
        }
        catch (error) {
            if (isKeyError(error)) {
                // fill with scalar if item doesn't exist
                const data = new (getTypedArrayCtr(this.dtype))(outSize);
                return new RawArray(data.fill(this.fillValue), outShape);
            }
            else {
                // Different type of error - rethrow
                throw error;
            }
        }
    }
    async set(selection = null, value, opts = {}) {
        await this.setBasicSelection(selection, value, opts);
    }
    async setBasicSelection(selection, value, { concurrencyLimit = 10, progressCallback } = {}) {
        if (this.readOnly) {
            throw new PermissionError("Object is read only");
        }
        if (!this.cacheMetadata) {
            await this.reloadMetadata();
        }
        if (this.shape.length === 0) {
            throw new Error("Shape [] indexing is not supported yet");
        }
        else {
            await this.setBasicSelectionND(selection, value, concurrencyLimit, progressCallback);
        }
    }
    async setBasicSelectionND(selection, value, concurrencyLimit, progressCallback) {
        const indexer = new BasicIndexer(selection, this);
        await this.setSelection(indexer, value, concurrencyLimit, progressCallback);
    }
    getChunkValue(proj, indexer, value, selectionShape) {
        let chunkValue;
        if (selectionShape.length === 0) {
            chunkValue = value;
        }
        else if (typeof value === "number") {
            chunkValue = value;
        }
        else {
            chunkValue = value.get(proj.outSelection);
            // tslint:disable-next-line: strict-type-predicates
            if (indexer.dropAxes !== null) {
                throw new Error("Handling drop axes not supported yet");
            }
        }
        return chunkValue;
    }
    async setSelection(indexer, value, concurrencyLimit, progressCallback) {
        // We iterate over all chunks which overlap the selection and thus contain data
        // that needs to be replaced. Each chunk is processed in turn, extracting the
        // necessary data from the value array and storing into the chunk array.
        // N.B., it is an important optimisation that we only visit chunks which overlap
        // the selection. This minimises the number of iterations in the main for loop.
        // TODO? check fields are sensible
        // Determine indices of chunks overlapping the selection
        const selectionShape = indexer.shape;
        // Check value shape
        if (selectionShape.length === 0) ;
        else if (typeof value === "number") ;
        else if (value instanceof NestedArray) {
            // TODO: non stringify equality check
            if (!arrayEquals1D(value.shape, selectionShape)) {
                throw new ValueError(`Shape mismatch in source NestedArray and set selection: ${value.shape} and ${selectionShape}`);
            }
        }
        else {
            // TODO support TypedArrays, buffers, etc
            throw new Error("Unknown data type for setting :(");
        }
        const queue = new PQueue({ concurrency: concurrencyLimit });
        const allTasks = [];
        if (progressCallback) {
            let queueSize = 0;
            for (const _ of indexer.iter())
                queueSize += 1;
            let progress = 0;
            progressCallback({ progress: 0, queueSize: queueSize });
            for (const proj of indexer.iter()) {
                const chunkValue = this.getChunkValue(proj, indexer, value, selectionShape);
                allTasks.push(queue.add(async () => {
                    await this.chunkSetItem(proj.chunkCoords, proj.chunkSelection, chunkValue);
                    progress += 1;
                    progressCallback({ progress: progress, queueSize: queueSize });
                }));
            }
        }
        else {
            for (const proj of indexer.iter()) {
                const chunkValue = this.getChunkValue(proj, indexer, value, selectionShape);
                allTasks.push(queue.add(() => this.chunkSetItem(proj.chunkCoords, proj.chunkSelection, chunkValue)));
            }
        }
        // guarantees that all work on queue has finished and throws if any of the tasks errored.
        await Promise.all(allTasks);
    }
    async chunkSetItem(chunkCoords, chunkSelection, value) {
        if (this.meta.order === "F" && this.nDims > 1) {
            throw new Error("Setting content for arrays in F-order is not supported.");
        }
        // Obtain key for chunk storage
        const chunkKey = this.chunkKey(chunkCoords);
        let chunk = null;
        const dtypeConstr = getTypedArrayCtr(this.dtype);
        const chunkSize = this.chunkSize;
        if (isTotalSlice(chunkSelection, this.chunks)) {
            // Totally replace chunk
            // Optimization: we are completely replacing the chunk, so no need
            // to access the existing chunk data
            if (typeof value === "number") {
                // TODO get the right type here
                chunk = new dtypeConstr(chunkSize);
                chunk.fill(value);
            }
            else {
                chunk = value.flatten();
            }
        }
        else {
            // partially replace the contents of this chunk
            // Existing chunk data
            let chunkData;
            try {
                // Chunk is initialized if this does not error
                const chunkStoreData = await this.chunkStore.getItem(chunkKey);
                const dBytes = await this.decodeChunk(chunkStoreData);
                chunkData = this.toTypedArray(dBytes);
            }
            catch (error) {
                if (isKeyError(error)) {
                    // Chunk is not initialized
                    chunkData = new dtypeConstr(chunkSize);
                    if (this.fillValue !== null) {
                        chunkData.fill(this.fillValue);
                    }
                }
                else {
                    // Different type of error - rethrow
                    throw error;
                }
            }
            const chunkNestedArray = new NestedArray(chunkData, this.chunks, this.dtype);
            chunkNestedArray.set(chunkSelection, value);
            chunk = chunkNestedArray.flatten();
        }
        const chunkData = await this.encodeChunk(chunk);
        this.chunkStore.setItem(chunkKey, chunkData);
    }
    async encodeChunk(chunk) {
        if (this.dtype.includes('>')) {
            /*
             * If big endian, flip bytes before applying compression and setting store.
             *
             * Here we create a copy (not in-place byteswapping) to avoid flipping the
             * bytes in the buffers of user-created Raw- and NestedArrays.
            */
            chunk = byteSwap$1(chunk);
        }
        if (this.compressor !== null) {
            const bytes = new Uint8Array(chunk.buffer);
            const cbytes = await (await this.compressor).encode(bytes);
            return cbytes.buffer;
        }
        // TODO: filters, etc
        return chunk.buffer;
    }
}

class MemoryStore {
    constructor(root = {}) {
        this.root = root;
    }
    proxy() {
        return createProxy(this);
    }
    getParent(item) {
        let parent = this.root;
        const segments = item.split('/');
        // find the parent container
        for (const k of segments.slice(0, segments.length - 1)) {
            parent = parent[k];
            if (!parent) {
                throw Error(item);
            }
            // if not isinstance(parent, self.cls):
            //     raise KeyError(item)
        }
        return [parent, segments[segments.length - 1]];
    }
    requireParent(item) {
        let parent = this.root;
        const segments = item.split('/');
        // require the parent container
        for (const k of segments.slice(0, segments.length - 1)) {
            // TODO: verify correct implementation
            if (parent[k] === undefined) {
                parent[k] = {};
            }
            parent = parent[k];
        }
        return [parent, segments[segments.length - 1]];
    }
    getItem(item) {
        const [parent, key] = this.getParent(item);
        const value = parent[key];
        if (value === undefined) {
            throw new KeyError(item);
        }
        return value;
    }
    setItem(item, value) {
        const [parent, key] = this.requireParent(item);
        parent[key] = value;
        return true;
    }
    deleteItem(item) {
        const [parent, key] = this.getParent(item);
        return delete parent[key];
    }
    containsItem(item) {
        // TODO: more sane implementation
        try {
            return this.getItem(item) !== undefined;
        }
        catch (e) {
            return false;
        }
    }
    keys() {
        throw new Error("Method not implemented.");
    }
}

var HTTPMethod;
(function (HTTPMethod) {
    HTTPMethod["HEAD"] = "HEAD";
    HTTPMethod["GET"] = "GET";
    HTTPMethod["PUT"] = "PUT";
})(HTTPMethod || (HTTPMethod = {}));
const DEFAULT_METHODS = [HTTPMethod.HEAD, HTTPMethod.GET, HTTPMethod.PUT];
class HTTPStore {
    constructor(url, options = {}) {
        this.url = url;
        const { fetchOptions = {}, supportedMethods = DEFAULT_METHODS } = options;
        this.fetchOptions = fetchOptions;
        this.supportedMethods = new Set(supportedMethods);
    }
    keys() {
        throw new Error('Method not implemented.');
    }
    async getItem(item, opts) {
        const url = resolveUrl(this.url, item);
        const value = await fetch(url, { ...this.fetchOptions, ...opts });
        if (value.status === 404) {
            // Item is not found
            throw new KeyError(item);
        }
        else if (value.status !== 200) {
            throw new HTTPError(String(value.status));
        }
        // only decode if 200
        if (IS_NODE) {
            return Buffer.from(await value.arrayBuffer());
        }
        else {
            return value.arrayBuffer(); // Browser
        }
    }
    async setItem(item, value) {
        if (!this.supportedMethods.has(HTTPMethod.PUT)) {
            throw new Error('HTTP PUT no a supported method for store.');
        }
        const url = resolveUrl(this.url, item);
        if (typeof value === 'string') {
            value = new TextEncoder().encode(value).buffer;
        }
        const set = await fetch(url, { ...this.fetchOptions, method: HTTPMethod.PUT, body: value });
        return set.status.toString()[0] === '2';
    }
    deleteItem(_item) {
        throw new Error('Method not implemented.');
    }
    async containsItem(item) {
        const url = resolveUrl(this.url, item);
        // Just check headers if HEAD method supported
        const method = this.supportedMethods.has(HTTPMethod.HEAD) ? HTTPMethod.HEAD : HTTPMethod.GET;
        const value = await fetch(url, { ...this.fetchOptions, method });
        return value.status === 200;
    }
}

const typeofs = [
  'string',
  'number',
  'bigint',
  'symbol'
];
const objectTypeNames = [
  'Function',
  'Generator',
  'AsyncGenerator',
  'GeneratorFunction',
  'AsyncGeneratorFunction',
  'AsyncFunction',
  'Observable',
  'Array',
  'Buffer',
  'Object',
  'RegExp',
  'Date',
  'Error',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'Promise',
  'URL',
  'HTMLElement',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array'
];
function is(value) {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === true || value === false) {
    return 'boolean';
  }
  const typeOf = typeof value;
  if (typeofs.includes(typeOf)) {
    return typeOf;
  }
  if (typeOf === 'function') {
    return 'Function';
  }
  if (Array.isArray(value)) {
    return 'Array';
  }
  if (isBuffer$1(value)) {
    return 'Buffer';
  }
  const objectType = getObjectType(value);
  if (objectType) {
    return objectType;
  }
  return 'Object';
}
function isBuffer$1(value) {
  return value && value.constructor && value.constructor.isBuffer && value.constructor.isBuffer.call(null, value);
}
function getObjectType(value) {
  const objectTypeName = Object.prototype.toString.call(value).slice(8, -1);
  if (objectTypeNames.includes(objectTypeName)) {
    return objectTypeName;
  }
  return undefined;
}

class Type {
  constructor(major, name, terminal) {
    this.major = major;
    this.majorEncoded = major << 5;
    this.name = name;
    this.terminal = terminal;
  }
  toString() {
    return `Type[${ this.major }].${ this.name }`;
  }
  compare(typ) {
    return this.major < typ.major ? -1 : this.major > typ.major ? 1 : 0;
  }
}
Type.uint = new Type(0, 'uint', true);
Type.negint = new Type(1, 'negint', true);
Type.bytes = new Type(2, 'bytes', true);
Type.string = new Type(3, 'string', true);
Type.array = new Type(4, 'array', false);
Type.map = new Type(5, 'map', false);
Type.tag = new Type(6, 'tag', false);
Type.float = new Type(7, 'float', true);
Type.false = new Type(7, 'false', true);
Type.true = new Type(7, 'true', true);
Type.null = new Type(7, 'null', true);
Type.undefined = new Type(7, 'undefined', true);
Type.break = new Type(7, 'break', true);
class Token {
  constructor(type, value, encodedLength) {
    this.type = type;
    this.value = value;
    this.encodedLength = encodedLength;
    this.encodedBytes = undefined;
    this.byteValue = undefined;
  }
  toString() {
    return `Token[${ this.type }].${ this.value }`;
  }
}

const useBuffer = globalThis.process && !globalThis.process.browser && globalThis.Buffer && typeof globalThis.Buffer.isBuffer === 'function';
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
function isBuffer(buf) {
  return useBuffer && globalThis.Buffer.isBuffer(buf);
}
function asU8A(buf) {
  if (!(buf instanceof Uint8Array)) {
    return Uint8Array.from(buf);
  }
  return isBuffer(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : buf;
}
const toString = useBuffer ? (bytes, start, end) => {
  return end - start > 64 ? globalThis.Buffer.from(bytes.subarray(start, end)).toString('utf8') : utf8Slice(bytes, start, end);
} : (bytes, start, end) => {
  return end - start > 64 ? textDecoder.decode(bytes.subarray(start, end)) : utf8Slice(bytes, start, end);
};
const fromString = useBuffer ? string => {
  return string.length > 64 ? globalThis.Buffer.from(string) : utf8ToBytes$1(string);
} : string => {
  return string.length > 64 ? textEncoder.encode(string) : utf8ToBytes$1(string);
};
const fromArray = arr => {
  return Uint8Array.from(arr);
};
const slice = useBuffer ? (bytes, start, end) => {
  if (isBuffer(bytes)) {
    return new Uint8Array(bytes.subarray(start, end));
  }
  return bytes.slice(start, end);
} : (bytes, start, end) => {
  return bytes.slice(start, end);
};
const concat$1 = useBuffer ? (chunks, length) => {
  chunks = chunks.map(c => c instanceof Uint8Array ? c : globalThis.Buffer.from(c));
  return asU8A(globalThis.Buffer.concat(chunks, length));
} : (chunks, length) => {
  const out = new Uint8Array(length);
  let off = 0;
  for (let b of chunks) {
    if (off + b.length > out.length) {
      b = b.subarray(0, out.length - off);
    }
    out.set(b, off);
    off += b.length;
  }
  return out;
};
const alloc = useBuffer ? size => {
  return globalThis.Buffer.allocUnsafe(size);
} : size => {
  return new Uint8Array(size);
};
function compare(b1, b2) {
  if (isBuffer(b1) && isBuffer(b2)) {
    return b1.compare(b2);
  }
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] === b2[i]) {
      continue;
    }
    return b1[i] < b2[i] ? -1 : 1;
  }
  return 0;
}
function utf8ToBytes$1(string, units = Infinity) {
  let codePoint;
  const length = string.length;
  let leadSurrogate = null;
  const bytes = [];
  for (let i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);
    if (codePoint > 55295 && codePoint < 57344) {
      if (!leadSurrogate) {
        if (codePoint > 56319) {
          if ((units -= 3) > -1)
            bytes.push(239, 191, 189);
          continue;
        } else if (i + 1 === length) {
          if ((units -= 3) > -1)
            bytes.push(239, 191, 189);
          continue;
        }
        leadSurrogate = codePoint;
        continue;
      }
      if (codePoint < 56320) {
        if ((units -= 3) > -1)
          bytes.push(239, 191, 189);
        leadSurrogate = codePoint;
        continue;
      }
      codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
    } else if (leadSurrogate) {
      if ((units -= 3) > -1)
        bytes.push(239, 191, 189);
    }
    leadSurrogate = null;
    if (codePoint < 128) {
      if ((units -= 1) < 0)
        break;
      bytes.push(codePoint);
    } else if (codePoint < 2048) {
      if ((units -= 2) < 0)
        break;
      bytes.push(codePoint >> 6 | 192, codePoint & 63 | 128);
    } else if (codePoint < 65536) {
      if ((units -= 3) < 0)
        break;
      bytes.push(codePoint >> 12 | 224, codePoint >> 6 & 63 | 128, codePoint & 63 | 128);
    } else if (codePoint < 1114112) {
      if ((units -= 4) < 0)
        break;
      bytes.push(codePoint >> 18 | 240, codePoint >> 12 & 63 | 128, codePoint >> 6 & 63 | 128, codePoint & 63 | 128);
    } else {
      throw new Error('Invalid code point');
    }
  }
  return bytes;
}
function utf8Slice(buf, offset, end) {
  const res = [];
  while (offset < end) {
    const firstByte = buf[offset];
    let codePoint = null;
    let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
    if (offset + bytesPerSequence <= end) {
      let secondByte, thirdByte, fourthByte, tempCodePoint;
      switch (bytesPerSequence) {
      case 1:
        if (firstByte < 128) {
          codePoint = firstByte;
        }
        break;
      case 2:
        secondByte = buf[offset + 1];
        if ((secondByte & 192) === 128) {
          tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
          if (tempCodePoint > 127) {
            codePoint = tempCodePoint;
          }
        }
        break;
      case 3:
        secondByte = buf[offset + 1];
        thirdByte = buf[offset + 2];
        if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
          tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
          if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
            codePoint = tempCodePoint;
          }
        }
        break;
      case 4:
        secondByte = buf[offset + 1];
        thirdByte = buf[offset + 2];
        fourthByte = buf[offset + 3];
        if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
          tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
          if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
            codePoint = tempCodePoint;
          }
        }
      }
    }
    if (codePoint === null) {
      codePoint = 65533;
      bytesPerSequence = 1;
    } else if (codePoint > 65535) {
      codePoint -= 65536;
      res.push(codePoint >>> 10 & 1023 | 55296);
      codePoint = 56320 | codePoint & 1023;
    }
    res.push(codePoint);
    offset += bytesPerSequence;
  }
  return decodeCodePointsArray(res);
}
const MAX_ARGUMENTS_LENGTH = 4096;
function decodeCodePointsArray(codePoints) {
  const len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints);
  }
  let res = '';
  let i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(String, codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH));
  }
  return res;
}

const defaultChunkSize = 256;
class Bl {
  constructor(chunkSize = defaultChunkSize) {
    this.chunkSize = chunkSize;
    this.cursor = 0;
    this.maxCursor = -1;
    this.chunks = [];
    this._initReuseChunk = null;
  }
  reset() {
    this.cursor = 0;
    this.maxCursor = -1;
    if (this.chunks.length) {
      this.chunks = [];
    }
    if (this._initReuseChunk !== null) {
      this.chunks.push(this._initReuseChunk);
      this.maxCursor = this._initReuseChunk.length - 1;
    }
  }
  push(bytes) {
    let topChunk = this.chunks[this.chunks.length - 1];
    const newMax = this.cursor + bytes.length;
    if (newMax <= this.maxCursor + 1) {
      const chunkPos = topChunk.length - (this.maxCursor - this.cursor) - 1;
      topChunk.set(bytes, chunkPos);
    } else {
      if (topChunk) {
        const chunkPos = topChunk.length - (this.maxCursor - this.cursor) - 1;
        if (chunkPos < topChunk.length) {
          this.chunks[this.chunks.length - 1] = topChunk.subarray(0, chunkPos);
          this.maxCursor = this.cursor - 1;
        }
      }
      if (bytes.length < 64 && bytes.length < this.chunkSize) {
        topChunk = alloc(this.chunkSize);
        this.chunks.push(topChunk);
        this.maxCursor += topChunk.length;
        if (this._initReuseChunk === null) {
          this._initReuseChunk = topChunk;
        }
        topChunk.set(bytes, 0);
      } else {
        this.chunks.push(bytes);
        this.maxCursor += bytes.length;
      }
    }
    this.cursor += bytes.length;
  }
  toBytes(reset = false) {
    let byts;
    if (this.chunks.length === 1) {
      const chunk = this.chunks[0];
      if (reset && this.cursor > chunk.length / 2) {
        byts = this.cursor === chunk.length ? chunk : chunk.subarray(0, this.cursor);
        this._initReuseChunk = null;
        this.chunks = [];
      } else {
        byts = slice(chunk, 0, this.cursor);
      }
    } else {
      byts = concat$1(this.chunks, this.cursor);
    }
    if (reset) {
      this.reset();
    }
    return byts;
  }
}

const decodeErrPrefix = 'CBOR decode error:';
const encodeErrPrefix = 'CBOR encode error:';
function assertEnoughData(data, pos, need) {
  if (data.length - pos < need) {
    throw new Error(`${ decodeErrPrefix } not enough data for type`);
  }
}

const uintBoundaries = [
  24,
  256,
  65536,
  4294967296,
  BigInt('18446744073709551616')
];
function readUint8(data, offset, options) {
  assertEnoughData(data, offset, 1);
  const value = data[offset];
  if (options.strict === true && value < uintBoundaries[0]) {
    throw new Error(`${ decodeErrPrefix } integer encoded in more bytes than necessary (strict decode)`);
  }
  return value;
}
function readUint16(data, offset, options) {
  assertEnoughData(data, offset, 2);
  const value = data[offset] << 8 | data[offset + 1];
  if (options.strict === true && value < uintBoundaries[1]) {
    throw new Error(`${ decodeErrPrefix } integer encoded in more bytes than necessary (strict decode)`);
  }
  return value;
}
function readUint32(data, offset, options) {
  assertEnoughData(data, offset, 4);
  const value = data[offset] * 16777216 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
  if (options.strict === true && value < uintBoundaries[2]) {
    throw new Error(`${ decodeErrPrefix } integer encoded in more bytes than necessary (strict decode)`);
  }
  return value;
}
function readUint64(data, offset, options) {
  assertEnoughData(data, offset, 8);
  const hi = data[offset] * 16777216 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
  const lo = data[offset + 4] * 16777216 + (data[offset + 5] << 16) + (data[offset + 6] << 8) + data[offset + 7];
  const value = (BigInt(hi) << BigInt(32)) + BigInt(lo);
  if (options.strict === true && value < uintBoundaries[3]) {
    throw new Error(`${ decodeErrPrefix } integer encoded in more bytes than necessary (strict decode)`);
  }
  if (value <= Number.MAX_SAFE_INTEGER) {
    return Number(value);
  }
  if (options.allowBigInt === true) {
    return value;
  }
  throw new Error(`${ decodeErrPrefix } integers outside of the safe integer range are not supported`);
}
function decodeUint8(data, pos, _minor, options) {
  return new Token(Type.uint, readUint8(data, pos + 1, options), 2);
}
function decodeUint16(data, pos, _minor, options) {
  return new Token(Type.uint, readUint16(data, pos + 1, options), 3);
}
function decodeUint32(data, pos, _minor, options) {
  return new Token(Type.uint, readUint32(data, pos + 1, options), 5);
}
function decodeUint64(data, pos, _minor, options) {
  return new Token(Type.uint, readUint64(data, pos + 1, options), 9);
}
function encodeUint(buf, token) {
  return encodeUintValue(buf, 0, token.value);
}
function encodeUintValue(buf, major, uint) {
  if (uint < uintBoundaries[0]) {
    const nuint = Number(uint);
    buf.push([major | nuint]);
  } else if (uint < uintBoundaries[1]) {
    const nuint = Number(uint);
    buf.push([
      major | 24,
      nuint
    ]);
  } else if (uint < uintBoundaries[2]) {
    const nuint = Number(uint);
    buf.push([
      major | 25,
      nuint >>> 8,
      nuint & 255
    ]);
  } else if (uint < uintBoundaries[3]) {
    const nuint = Number(uint);
    buf.push([
      major | 26,
      nuint >>> 24 & 255,
      nuint >>> 16 & 255,
      nuint >>> 8 & 255,
      nuint & 255
    ]);
  } else {
    const buint = BigInt(uint);
    if (buint < uintBoundaries[4]) {
      const set = [
        major | 27,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ];
      let lo = Number(buint & BigInt(4294967295));
      let hi = Number(buint >> BigInt(32) & BigInt(4294967295));
      set[8] = lo & 255;
      lo = lo >> 8;
      set[7] = lo & 255;
      lo = lo >> 8;
      set[6] = lo & 255;
      lo = lo >> 8;
      set[5] = lo & 255;
      set[4] = hi & 255;
      hi = hi >> 8;
      set[3] = hi & 255;
      hi = hi >> 8;
      set[2] = hi & 255;
      hi = hi >> 8;
      set[1] = hi & 255;
      buf.push(set);
    } else {
      throw new Error(`${ decodeErrPrefix } encountered BigInt larger than allowable range`);
    }
  }
}
encodeUint.encodedSize = function encodedSize(token) {
  return encodeUintValue.encodedSize(token.value);
};
encodeUintValue.encodedSize = function encodedSize(uint) {
  if (uint < uintBoundaries[0]) {
    return 1;
  }
  if (uint < uintBoundaries[1]) {
    return 2;
  }
  if (uint < uintBoundaries[2]) {
    return 3;
  }
  if (uint < uintBoundaries[3]) {
    return 5;
  }
  return 9;
};
encodeUint.compareTokens = function compareTokens(tok1, tok2) {
  return tok1.value < tok2.value ? -1 : tok1.value > tok2.value ? 1 : 0;
};

function decodeNegint8(data, pos, _minor, options) {
  return new Token(Type.negint, -1 - readUint8(data, pos + 1, options), 2);
}
function decodeNegint16(data, pos, _minor, options) {
  return new Token(Type.negint, -1 - readUint16(data, pos + 1, options), 3);
}
function decodeNegint32(data, pos, _minor, options) {
  return new Token(Type.negint, -1 - readUint32(data, pos + 1, options), 5);
}
const neg1b = BigInt(-1);
const pos1b = BigInt(1);
function decodeNegint64(data, pos, _minor, options) {
  const int = readUint64(data, pos + 1, options);
  if (typeof int !== 'bigint') {
    const value = -1 - int;
    if (value >= Number.MIN_SAFE_INTEGER) {
      return new Token(Type.negint, value, 9);
    }
  }
  if (options.allowBigInt !== true) {
    throw new Error(`${ decodeErrPrefix } integers outside of the safe integer range are not supported`);
  }
  return new Token(Type.negint, neg1b - BigInt(int), 9);
}
function encodeNegint(buf, token) {
  const negint = token.value;
  const unsigned = typeof negint === 'bigint' ? negint * neg1b - pos1b : negint * -1 - 1;
  encodeUintValue(buf, token.type.majorEncoded, unsigned);
}
encodeNegint.encodedSize = function encodedSize(token) {
  const negint = token.value;
  const unsigned = typeof negint === 'bigint' ? negint * neg1b - pos1b : negint * -1 - 1;
  if (unsigned < uintBoundaries[0]) {
    return 1;
  }
  if (unsigned < uintBoundaries[1]) {
    return 2;
  }
  if (unsigned < uintBoundaries[2]) {
    return 3;
  }
  if (unsigned < uintBoundaries[3]) {
    return 5;
  }
  return 9;
};
encodeNegint.compareTokens = function compareTokens(tok1, tok2) {
  return tok1.value < tok2.value ? 1 : tok1.value > tok2.value ? -1 : 0;
};

function toToken$3(data, pos, prefix, length) {
  assertEnoughData(data, pos, prefix + length);
  const buf = slice(data, pos + prefix, pos + prefix + length);
  return new Token(Type.bytes, buf, prefix + length);
}
function decodeBytesCompact(data, pos, minor, _options) {
  return toToken$3(data, pos, 1, minor);
}
function decodeBytes8(data, pos, _minor, options) {
  return toToken$3(data, pos, 2, readUint8(data, pos + 1, options));
}
function decodeBytes16(data, pos, _minor, options) {
  return toToken$3(data, pos, 3, readUint16(data, pos + 1, options));
}
function decodeBytes32(data, pos, _minor, options) {
  return toToken$3(data, pos, 5, readUint32(data, pos + 1, options));
}
function decodeBytes64(data, pos, _minor, options) {
  const l = readUint64(data, pos + 1, options);
  if (typeof l === 'bigint') {
    throw new Error(`${ decodeErrPrefix } 64-bit integer bytes lengths not supported`);
  }
  return toToken$3(data, pos, 9, l);
}
function tokenBytes(token) {
  if (token.encodedBytes === undefined) {
    token.encodedBytes = token.type === Type.string ? fromString(token.value) : token.value;
  }
  return token.encodedBytes;
}
function encodeBytes(buf, token) {
  const bytes = tokenBytes(token);
  encodeUintValue(buf, token.type.majorEncoded, bytes.length);
  buf.push(bytes);
}
encodeBytes.encodedSize = function encodedSize(token) {
  const bytes = tokenBytes(token);
  return encodeUintValue.encodedSize(bytes.length) + bytes.length;
};
encodeBytes.compareTokens = function compareTokens(tok1, tok2) {
  return compareBytes(tokenBytes(tok1), tokenBytes(tok2));
};
function compareBytes(b1, b2) {
  return b1.length < b2.length ? -1 : b1.length > b2.length ? 1 : compare(b1, b2);
}

function toToken$2(data, pos, prefix, length, options) {
  const totLength = prefix + length;
  assertEnoughData(data, pos, totLength);
  const tok = new Token(Type.string, toString(data, pos + prefix, pos + totLength), totLength);
  if (options.retainStringBytes === true) {
    tok.byteValue = slice(data, pos + prefix, pos + totLength);
  }
  return tok;
}
function decodeStringCompact(data, pos, minor, options) {
  return toToken$2(data, pos, 1, minor, options);
}
function decodeString8(data, pos, _minor, options) {
  return toToken$2(data, pos, 2, readUint8(data, pos + 1, options), options);
}
function decodeString16(data, pos, _minor, options) {
  return toToken$2(data, pos, 3, readUint16(data, pos + 1, options), options);
}
function decodeString32(data, pos, _minor, options) {
  return toToken$2(data, pos, 5, readUint32(data, pos + 1, options), options);
}
function decodeString64(data, pos, _minor, options) {
  const l = readUint64(data, pos + 1, options);
  if (typeof l === 'bigint') {
    throw new Error(`${ decodeErrPrefix } 64-bit integer string lengths not supported`);
  }
  return toToken$2(data, pos, 9, l, options);
}
const encodeString = encodeBytes;

function toToken$1(_data, _pos, prefix, length) {
  return new Token(Type.array, length, prefix);
}
function decodeArrayCompact(data, pos, minor, _options) {
  return toToken$1(data, pos, 1, minor);
}
function decodeArray8(data, pos, _minor, options) {
  return toToken$1(data, pos, 2, readUint8(data, pos + 1, options));
}
function decodeArray16(data, pos, _minor, options) {
  return toToken$1(data, pos, 3, readUint16(data, pos + 1, options));
}
function decodeArray32(data, pos, _minor, options) {
  return toToken$1(data, pos, 5, readUint32(data, pos + 1, options));
}
function decodeArray64(data, pos, _minor, options) {
  const l = readUint64(data, pos + 1, options);
  if (typeof l === 'bigint') {
    throw new Error(`${ decodeErrPrefix } 64-bit integer array lengths not supported`);
  }
  return toToken$1(data, pos, 9, l);
}
function decodeArrayIndefinite(data, pos, _minor, options) {
  if (options.allowIndefinite === false) {
    throw new Error(`${ decodeErrPrefix } indefinite length items not allowed`);
  }
  return toToken$1(data, pos, 1, Infinity);
}
function encodeArray(buf, token) {
  encodeUintValue(buf, Type.array.majorEncoded, token.value);
}
encodeArray.compareTokens = encodeUint.compareTokens;
encodeArray.encodedSize = function encodedSize(token) {
  return encodeUintValue.encodedSize(token.value);
};

function toToken(_data, _pos, prefix, length) {
  return new Token(Type.map, length, prefix);
}
function decodeMapCompact(data, pos, minor, _options) {
  return toToken(data, pos, 1, minor);
}
function decodeMap8(data, pos, _minor, options) {
  return toToken(data, pos, 2, readUint8(data, pos + 1, options));
}
function decodeMap16(data, pos, _minor, options) {
  return toToken(data, pos, 3, readUint16(data, pos + 1, options));
}
function decodeMap32(data, pos, _minor, options) {
  return toToken(data, pos, 5, readUint32(data, pos + 1, options));
}
function decodeMap64(data, pos, _minor, options) {
  const l = readUint64(data, pos + 1, options);
  if (typeof l === 'bigint') {
    throw new Error(`${ decodeErrPrefix } 64-bit integer map lengths not supported`);
  }
  return toToken(data, pos, 9, l);
}
function decodeMapIndefinite(data, pos, _minor, options) {
  if (options.allowIndefinite === false) {
    throw new Error(`${ decodeErrPrefix } indefinite length items not allowed`);
  }
  return toToken(data, pos, 1, Infinity);
}
function encodeMap(buf, token) {
  encodeUintValue(buf, Type.map.majorEncoded, token.value);
}
encodeMap.compareTokens = encodeUint.compareTokens;
encodeMap.encodedSize = function encodedSize(token) {
  return encodeUintValue.encodedSize(token.value);
};

function decodeTagCompact(_data, _pos, minor, _options) {
  return new Token(Type.tag, minor, 1);
}
function decodeTag8(data, pos, _minor, options) {
  return new Token(Type.tag, readUint8(data, pos + 1, options), 2);
}
function decodeTag16(data, pos, _minor, options) {
  return new Token(Type.tag, readUint16(data, pos + 1, options), 3);
}
function decodeTag32(data, pos, _minor, options) {
  return new Token(Type.tag, readUint32(data, pos + 1, options), 5);
}
function decodeTag64(data, pos, _minor, options) {
  return new Token(Type.tag, readUint64(data, pos + 1, options), 9);
}
function encodeTag(buf, token) {
  encodeUintValue(buf, Type.tag.majorEncoded, token.value);
}
encodeTag.compareTokens = encodeUint.compareTokens;
encodeTag.encodedSize = function encodedSize(token) {
  return encodeUintValue.encodedSize(token.value);
};

const MINOR_FALSE = 20;
const MINOR_TRUE = 21;
const MINOR_NULL = 22;
const MINOR_UNDEFINED = 23;
function decodeUndefined(_data, _pos, _minor, options) {
  if (options.allowUndefined === false) {
    throw new Error(`${ decodeErrPrefix } undefined values are not supported`);
  } else if (options.coerceUndefinedToNull === true) {
    return new Token(Type.null, null, 1);
  }
  return new Token(Type.undefined, undefined, 1);
}
function decodeBreak(_data, _pos, _minor, options) {
  if (options.allowIndefinite === false) {
    throw new Error(`${ decodeErrPrefix } indefinite length items not allowed`);
  }
  return new Token(Type.break, undefined, 1);
}
function createToken(value, bytes, options) {
  if (options) {
    if (options.allowNaN === false && Number.isNaN(value)) {
      throw new Error(`${ decodeErrPrefix } NaN values are not supported`);
    }
    if (options.allowInfinity === false && (value === Infinity || value === -Infinity)) {
      throw new Error(`${ decodeErrPrefix } Infinity values are not supported`);
    }
  }
  return new Token(Type.float, value, bytes);
}
function decodeFloat16(data, pos, _minor, options) {
  return createToken(readFloat16(data, pos + 1), 3, options);
}
function decodeFloat32(data, pos, _minor, options) {
  return createToken(readFloat32(data, pos + 1), 5, options);
}
function decodeFloat64(data, pos, _minor, options) {
  return createToken(readFloat64(data, pos + 1), 9, options);
}
function encodeFloat(buf, token, options) {
  const float = token.value;
  if (float === false) {
    buf.push([Type.float.majorEncoded | MINOR_FALSE]);
  } else if (float === true) {
    buf.push([Type.float.majorEncoded | MINOR_TRUE]);
  } else if (float === null) {
    buf.push([Type.float.majorEncoded | MINOR_NULL]);
  } else if (float === undefined) {
    buf.push([Type.float.majorEncoded | MINOR_UNDEFINED]);
  } else {
    let decoded;
    let success = false;
    if (!options || options.float64 !== true) {
      encodeFloat16(float);
      decoded = readFloat16(ui8a, 1);
      if (float === decoded || Number.isNaN(float)) {
        ui8a[0] = 249;
        buf.push(ui8a.slice(0, 3));
        success = true;
      } else {
        encodeFloat32(float);
        decoded = readFloat32(ui8a, 1);
        if (float === decoded) {
          ui8a[0] = 250;
          buf.push(ui8a.slice(0, 5));
          success = true;
        }
      }
    }
    if (!success) {
      encodeFloat64(float);
      decoded = readFloat64(ui8a, 1);
      ui8a[0] = 251;
      buf.push(ui8a.slice(0, 9));
    }
  }
}
encodeFloat.encodedSize = function encodedSize(token, options) {
  const float = token.value;
  if (float === false || float === true || float === null || float === undefined) {
    return 1;
  }
  if (!options || options.float64 !== true) {
    encodeFloat16(float);
    let decoded = readFloat16(ui8a, 1);
    if (float === decoded || Number.isNaN(float)) {
      return 3;
    }
    encodeFloat32(float);
    decoded = readFloat32(ui8a, 1);
    if (float === decoded) {
      return 5;
    }
  }
  return 9;
};
const buffer = new ArrayBuffer(9);
const dataView = new DataView(buffer, 1);
const ui8a = new Uint8Array(buffer, 0);
function encodeFloat16(inp) {
  if (inp === Infinity) {
    dataView.setUint16(0, 31744, false);
  } else if (inp === -Infinity) {
    dataView.setUint16(0, 64512, false);
  } else if (Number.isNaN(inp)) {
    dataView.setUint16(0, 32256, false);
  } else {
    dataView.setFloat32(0, inp);
    const valu32 = dataView.getUint32(0);
    const exponent = (valu32 & 2139095040) >> 23;
    const mantissa = valu32 & 8388607;
    if (exponent === 255) {
      dataView.setUint16(0, 31744, false);
    } else if (exponent === 0) {
      dataView.setUint16(0, (inp & 2147483648) >> 16 | mantissa >> 13, false);
    } else {
      const logicalExponent = exponent - 127;
      if (logicalExponent < -24) {
        dataView.setUint16(0, 0);
      } else if (logicalExponent < -14) {
        dataView.setUint16(0, (valu32 & 2147483648) >> 16 | 1 << 24 + logicalExponent, false);
      } else {
        dataView.setUint16(0, (valu32 & 2147483648) >> 16 | logicalExponent + 15 << 10 | mantissa >> 13, false);
      }
    }
  }
}
function readFloat16(ui8a, pos) {
  if (ui8a.length - pos < 2) {
    throw new Error(`${ decodeErrPrefix } not enough data for float16`);
  }
  const half = (ui8a[pos] << 8) + ui8a[pos + 1];
  if (half === 31744) {
    return Infinity;
  }
  if (half === 64512) {
    return -Infinity;
  }
  if (half === 32256) {
    return NaN;
  }
  const exp = half >> 10 & 31;
  const mant = half & 1023;
  let val;
  if (exp === 0) {
    val = mant * 2 ** -24;
  } else if (exp !== 31) {
    val = (mant + 1024) * 2 ** (exp - 25);
  } else {
    val = mant === 0 ? Infinity : NaN;
  }
  return half & 32768 ? -val : val;
}
function encodeFloat32(inp) {
  dataView.setFloat32(0, inp, false);
}
function readFloat32(ui8a, pos) {
  if (ui8a.length - pos < 4) {
    throw new Error(`${ decodeErrPrefix } not enough data for float32`);
  }
  const offset = (ui8a.byteOffset || 0) + pos;
  return new DataView(ui8a.buffer, offset, 4).getFloat32(0, false);
}
function encodeFloat64(inp) {
  dataView.setFloat64(0, inp, false);
}
function readFloat64(ui8a, pos) {
  if (ui8a.length - pos < 8) {
    throw new Error(`${ decodeErrPrefix } not enough data for float64`);
  }
  const offset = (ui8a.byteOffset || 0) + pos;
  return new DataView(ui8a.buffer, offset, 8).getFloat64(0, false);
}
encodeFloat.compareTokens = encodeUint.compareTokens;

function invalidMinor(data, pos, minor) {
  throw new Error(`${ decodeErrPrefix } encountered invalid minor (${ minor }) for major ${ data[pos] >>> 5 }`);
}
function errorer(msg) {
  return () => {
    throw new Error(`${ decodeErrPrefix } ${ msg }`);
  };
}
const jump = [];
for (let i = 0; i <= 23; i++) {
  jump[i] = invalidMinor;
}
jump[24] = decodeUint8;
jump[25] = decodeUint16;
jump[26] = decodeUint32;
jump[27] = decodeUint64;
jump[28] = invalidMinor;
jump[29] = invalidMinor;
jump[30] = invalidMinor;
jump[31] = invalidMinor;
for (let i = 32; i <= 55; i++) {
  jump[i] = invalidMinor;
}
jump[56] = decodeNegint8;
jump[57] = decodeNegint16;
jump[58] = decodeNegint32;
jump[59] = decodeNegint64;
jump[60] = invalidMinor;
jump[61] = invalidMinor;
jump[62] = invalidMinor;
jump[63] = invalidMinor;
for (let i = 64; i <= 87; i++) {
  jump[i] = decodeBytesCompact;
}
jump[88] = decodeBytes8;
jump[89] = decodeBytes16;
jump[90] = decodeBytes32;
jump[91] = decodeBytes64;
jump[92] = invalidMinor;
jump[93] = invalidMinor;
jump[94] = invalidMinor;
jump[95] = errorer('indefinite length bytes/strings are not supported');
for (let i = 96; i <= 119; i++) {
  jump[i] = decodeStringCompact;
}
jump[120] = decodeString8;
jump[121] = decodeString16;
jump[122] = decodeString32;
jump[123] = decodeString64;
jump[124] = invalidMinor;
jump[125] = invalidMinor;
jump[126] = invalidMinor;
jump[127] = errorer('indefinite length bytes/strings are not supported');
for (let i = 128; i <= 151; i++) {
  jump[i] = decodeArrayCompact;
}
jump[152] = decodeArray8;
jump[153] = decodeArray16;
jump[154] = decodeArray32;
jump[155] = decodeArray64;
jump[156] = invalidMinor;
jump[157] = invalidMinor;
jump[158] = invalidMinor;
jump[159] = decodeArrayIndefinite;
for (let i = 160; i <= 183; i++) {
  jump[i] = decodeMapCompact;
}
jump[184] = decodeMap8;
jump[185] = decodeMap16;
jump[186] = decodeMap32;
jump[187] = decodeMap64;
jump[188] = invalidMinor;
jump[189] = invalidMinor;
jump[190] = invalidMinor;
jump[191] = decodeMapIndefinite;
for (let i = 192; i <= 215; i++) {
  jump[i] = decodeTagCompact;
}
jump[216] = decodeTag8;
jump[217] = decodeTag16;
jump[218] = decodeTag32;
jump[219] = decodeTag64;
jump[220] = invalidMinor;
jump[221] = invalidMinor;
jump[222] = invalidMinor;
jump[223] = invalidMinor;
for (let i = 224; i <= 243; i++) {
  jump[i] = errorer('simple values are not supported');
}
jump[244] = invalidMinor;
jump[245] = invalidMinor;
jump[246] = invalidMinor;
jump[247] = decodeUndefined;
jump[248] = errorer('simple values are not supported');
jump[249] = decodeFloat16;
jump[250] = decodeFloat32;
jump[251] = decodeFloat64;
jump[252] = invalidMinor;
jump[253] = invalidMinor;
jump[254] = invalidMinor;
jump[255] = decodeBreak;
const quick = [];
for (let i = 0; i < 24; i++) {
  quick[i] = new Token(Type.uint, i, 1);
}
for (let i = -1; i >= -24; i--) {
  quick[31 - i] = new Token(Type.negint, i, 1);
}
quick[64] = new Token(Type.bytes, new Uint8Array(0), 1);
quick[96] = new Token(Type.string, '', 1);
quick[128] = new Token(Type.array, 0, 1);
quick[160] = new Token(Type.map, 0, 1);
quick[244] = new Token(Type.false, false, 1);
quick[245] = new Token(Type.true, true, 1);
quick[246] = new Token(Type.null, null, 1);
function quickEncodeToken(token) {
  switch (token.type) {
  case Type.false:
    return fromArray([244]);
  case Type.true:
    return fromArray([245]);
  case Type.null:
    return fromArray([246]);
  case Type.bytes:
    if (!token.value.length) {
      return fromArray([64]);
    }
    return;
  case Type.string:
    if (token.value === '') {
      return fromArray([96]);
    }
    return;
  case Type.array:
    if (token.value === 0) {
      return fromArray([128]);
    }
    return;
  case Type.map:
    if (token.value === 0) {
      return fromArray([160]);
    }
    return;
  case Type.uint:
    if (token.value < 24) {
      return fromArray([Number(token.value)]);
    }
    return;
  case Type.negint:
    if (token.value >= -24) {
      return fromArray([31 - Number(token.value)]);
    }
  }
}

const defaultEncodeOptions = {
  float64: false,
  mapSorter,
  quickEncodeToken
};
function makeCborEncoders() {
  const encoders = [];
  encoders[Type.uint.major] = encodeUint;
  encoders[Type.negint.major] = encodeNegint;
  encoders[Type.bytes.major] = encodeBytes;
  encoders[Type.string.major] = encodeString;
  encoders[Type.array.major] = encodeArray;
  encoders[Type.map.major] = encodeMap;
  encoders[Type.tag.major] = encodeTag;
  encoders[Type.float.major] = encodeFloat;
  return encoders;
}
const cborEncoders = makeCborEncoders();
const buf = new Bl();
class Ref {
  constructor(obj, parent) {
    this.obj = obj;
    this.parent = parent;
  }
  includes(obj) {
    let p = this;
    do {
      if (p.obj === obj) {
        return true;
      }
    } while (p = p.parent);
    return false;
  }
  static createCheck(stack, obj) {
    if (stack && stack.includes(obj)) {
      throw new Error(`${ encodeErrPrefix } object contains circular references`);
    }
    return new Ref(obj, stack);
  }
}
const simpleTokens = {
  null: new Token(Type.null, null),
  undefined: new Token(Type.undefined, undefined),
  true: new Token(Type.true, true),
  false: new Token(Type.false, false),
  emptyArray: new Token(Type.array, 0),
  emptyMap: new Token(Type.map, 0)
};
const typeEncoders = {
  number(obj, _typ, _options, _refStack) {
    if (!Number.isInteger(obj) || !Number.isSafeInteger(obj)) {
      return new Token(Type.float, obj);
    } else if (obj >= 0) {
      return new Token(Type.uint, obj);
    } else {
      return new Token(Type.negint, obj);
    }
  },
  bigint(obj, _typ, _options, _refStack) {
    if (obj >= BigInt(0)) {
      return new Token(Type.uint, obj);
    } else {
      return new Token(Type.negint, obj);
    }
  },
  Uint8Array(obj, _typ, _options, _refStack) {
    return new Token(Type.bytes, obj);
  },
  string(obj, _typ, _options, _refStack) {
    return new Token(Type.string, obj);
  },
  boolean(obj, _typ, _options, _refStack) {
    return obj ? simpleTokens.true : simpleTokens.false;
  },
  null(_obj, _typ, _options, _refStack) {
    return simpleTokens.null;
  },
  undefined(_obj, _typ, _options, _refStack) {
    return simpleTokens.undefined;
  },
  ArrayBuffer(obj, _typ, _options, _refStack) {
    return new Token(Type.bytes, new Uint8Array(obj));
  },
  DataView(obj, _typ, _options, _refStack) {
    return new Token(Type.bytes, new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength));
  },
  Array(obj, _typ, options, refStack) {
    if (!obj.length) {
      if (options.addBreakTokens === true) {
        return [
          simpleTokens.emptyArray,
          new Token(Type.break)
        ];
      }
      return simpleTokens.emptyArray;
    }
    refStack = Ref.createCheck(refStack, obj);
    const entries = [];
    let i = 0;
    for (const e of obj) {
      entries[i++] = objectToTokens(e, options, refStack);
    }
    if (options.addBreakTokens) {
      return [
        new Token(Type.array, obj.length),
        entries,
        new Token(Type.break)
      ];
    }
    return [
      new Token(Type.array, obj.length),
      entries
    ];
  },
  Object(obj, typ, options, refStack) {
    const isMap = typ !== 'Object';
    const keys = isMap ? obj.keys() : Object.keys(obj);
    const length = isMap ? obj.size : keys.length;
    if (!length) {
      if (options.addBreakTokens === true) {
        return [
          simpleTokens.emptyMap,
          new Token(Type.break)
        ];
      }
      return simpleTokens.emptyMap;
    }
    refStack = Ref.createCheck(refStack, obj);
    const entries = [];
    let i = 0;
    for (const key of keys) {
      entries[i++] = [
        objectToTokens(key, options, refStack),
        objectToTokens(isMap ? obj.get(key) : obj[key], options, refStack)
      ];
    }
    sortMapEntries(entries, options);
    if (options.addBreakTokens) {
      return [
        new Token(Type.map, length),
        entries,
        new Token(Type.break)
      ];
    }
    return [
      new Token(Type.map, length),
      entries
    ];
  }
};
typeEncoders.Map = typeEncoders.Object;
typeEncoders.Buffer = typeEncoders.Uint8Array;
for (const typ of 'Uint8Clamped Uint16 Uint32 Int8 Int16 Int32 BigUint64 BigInt64 Float32 Float64'.split(' ')) {
  typeEncoders[`${ typ }Array`] = typeEncoders.DataView;
}
function objectToTokens(obj, options = {}, refStack) {
  const typ = is(obj);
  const customTypeEncoder = options && options.typeEncoders && options.typeEncoders[typ] || typeEncoders[typ];
  if (typeof customTypeEncoder === 'function') {
    const tokens = customTypeEncoder(obj, typ, options, refStack);
    if (tokens != null) {
      return tokens;
    }
  }
  const typeEncoder = typeEncoders[typ];
  if (!typeEncoder) {
    throw new Error(`${ encodeErrPrefix } unsupported type: ${ typ }`);
  }
  return typeEncoder(obj, typ, options, refStack);
}
function sortMapEntries(entries, options) {
  if (options.mapSorter) {
    entries.sort(options.mapSorter);
  }
}
function mapSorter(e1, e2) {
  const keyToken1 = Array.isArray(e1[0]) ? e1[0][0] : e1[0];
  const keyToken2 = Array.isArray(e2[0]) ? e2[0][0] : e2[0];
  if (keyToken1.type !== keyToken2.type) {
    return keyToken1.type.compare(keyToken2.type);
  }
  const major = keyToken1.type.major;
  const tcmp = cborEncoders[major].compareTokens(keyToken1, keyToken2);
  if (tcmp === 0) {
    console.warn('WARNING: complex key types used, CBOR key sorting guarantees are gone');
  }
  return tcmp;
}
function tokensToEncoded(buf, tokens, encoders, options) {
  if (Array.isArray(tokens)) {
    for (const token of tokens) {
      tokensToEncoded(buf, token, encoders, options);
    }
  } else {
    encoders[tokens.type.major](buf, tokens, options);
  }
}
function encodeCustom(data, encoders, options) {
  const tokens = objectToTokens(data, options);
  if (!Array.isArray(tokens) && options.quickEncodeToken) {
    const quickBytes = options.quickEncodeToken(tokens);
    if (quickBytes) {
      return quickBytes;
    }
    const encoder = encoders[tokens.type.major];
    if (encoder.encodedSize) {
      const size = encoder.encodedSize(tokens, options);
      const buf = new Bl(size);
      encoder(buf, tokens, options);
      if (buf.chunks.length !== 1) {
        throw new Error(`Unexpected error: pre-calculated length for ${ tokens } was wrong`);
      }
      return asU8A(buf.chunks[0]);
    }
  }
  buf.reset();
  tokensToEncoded(buf, tokens, encoders, options);
  return buf.toBytes(true);
}
function encode$5(data, options) {
  options = Object.assign({}, defaultEncodeOptions, options);
  return encodeCustom(data, cborEncoders, options);
}

const defaultDecodeOptions = {
  strict: false,
  allowIndefinite: true,
  allowUndefined: true,
  allowBigInt: true
};
class Tokeniser {
  constructor(data, options = {}) {
    this.pos = 0;
    this.data = data;
    this.options = options;
  }
  done() {
    return this.pos >= this.data.length;
  }
  next() {
    const byt = this.data[this.pos];
    let token = quick[byt];
    if (token === undefined) {
      const decoder = jump[byt];
      if (!decoder) {
        throw new Error(`${ decodeErrPrefix } no decoder for major type ${ byt >>> 5 } (byte 0x${ byt.toString(16).padStart(2, '0') })`);
      }
      const minor = byt & 31;
      token = decoder(this.data, this.pos, minor, this.options);
    }
    this.pos += token.encodedLength;
    return token;
  }
}
const DONE = Symbol.for('DONE');
const BREAK = Symbol.for('BREAK');
function tokenToArray(token, tokeniser, options) {
  const arr = [];
  for (let i = 0; i < token.value; i++) {
    const value = tokensToObject(tokeniser, options);
    if (value === BREAK) {
      if (token.value === Infinity) {
        break;
      }
      throw new Error(`${ decodeErrPrefix } got unexpected break to lengthed array`);
    }
    if (value === DONE) {
      throw new Error(`${ decodeErrPrefix } found array but not enough entries (got ${ i }, expected ${ token.value })`);
    }
    arr[i] = value;
  }
  return arr;
}
function tokenToMap(token, tokeniser, options) {
  const useMaps = options.useMaps === true;
  const obj = useMaps ? undefined : {};
  const m = useMaps ? new Map() : undefined;
  for (let i = 0; i < token.value; i++) {
    const key = tokensToObject(tokeniser, options);
    if (key === BREAK) {
      if (token.value === Infinity) {
        break;
      }
      throw new Error(`${ decodeErrPrefix } got unexpected break to lengthed map`);
    }
    if (key === DONE) {
      throw new Error(`${ decodeErrPrefix } found map but not enough entries (got ${ i } [no key], expected ${ token.value })`);
    }
    if (useMaps !== true && typeof key !== 'string') {
      throw new Error(`${ decodeErrPrefix } non-string keys not supported (got ${ typeof key })`);
    }
    if (options.rejectDuplicateMapKeys === true) {
      if (useMaps && m.has(key) || !useMaps && key in obj) {
        throw new Error(`${ decodeErrPrefix } found repeat map key "${ key }"`);
      }
    }
    const value = tokensToObject(tokeniser, options);
    if (value === DONE) {
      throw new Error(`${ decodeErrPrefix } found map but not enough entries (got ${ i } [no value], expected ${ token.value })`);
    }
    if (useMaps) {
      m.set(key, value);
    } else {
      obj[key] = value;
    }
  }
  return useMaps ? m : obj;
}
function tokensToObject(tokeniser, options) {
  if (tokeniser.done()) {
    return DONE;
  }
  const token = tokeniser.next();
  if (token.type === Type.break) {
    return BREAK;
  }
  if (token.type.terminal) {
    return token.value;
  }
  if (token.type === Type.array) {
    return tokenToArray(token, tokeniser, options);
  }
  if (token.type === Type.map) {
    return tokenToMap(token, tokeniser, options);
  }
  if (token.type === Type.tag) {
    if (options.tags && typeof options.tags[token.value] === 'function') {
      const tagged = tokensToObject(tokeniser, options);
      return options.tags[token.value](tagged);
    }
    throw new Error(`${ decodeErrPrefix } tag not supported (${ token.value })`);
  }
  throw new Error('unsupported');
}
function decode$7(data, options) {
  if (!(data instanceof Uint8Array)) {
    throw new Error(`${ decodeErrPrefix } data to decode must be a Uint8Array`);
  }
  options = Object.assign({}, defaultDecodeOptions, options);
  const tokeniser = options.tokenizer || new Tokeniser(data, options);
  const decoded = tokensToObject(tokeniser, options);
  if (decoded === DONE) {
    throw new Error(`${ decodeErrPrefix } did not find any content to decode`);
  }
  if (decoded === BREAK) {
    throw new Error(`${ decodeErrPrefix } got unexpected break`);
  }
  if (!tokeniser.done()) {
    throw new Error(`${ decodeErrPrefix } too many terminals, data makes no sense`);
  }
  return decoded;
}

var encode_1$1 = encode$4;
var MSB$2 = 128, REST$2 = 127, MSBALL$1 = ~REST$2, INT$1 = Math.pow(2, 31);
function encode$4(num, out, offset) {
  out = out || [];
  offset = offset || 0;
  var oldOffset = offset;
  while (num >= INT$1) {
    out[offset++] = num & 255 | MSB$2;
    num /= 128;
  }
  while (num & MSBALL$1) {
    out[offset++] = num & 255 | MSB$2;
    num >>>= 7;
  }
  out[offset] = num | 0;
  encode$4.bytes = offset - oldOffset + 1;
  return out;
}
var decode$6 = read$1;
var MSB$1$1 = 128, REST$1$1 = 127;
function read$1(buf, offset) {
  var res = 0, offset = offset || 0, shift = 0, counter = offset, b, l = buf.length;
  do {
    if (counter >= l) {
      read$1.bytes = 0;
      throw new RangeError('Could not decode varint');
    }
    b = buf[counter++];
    res += shift < 28 ? (b & REST$1$1) << shift : (b & REST$1$1) * Math.pow(2, shift);
    shift += 7;
  } while (b >= MSB$1$1);
  read$1.bytes = counter - offset;
  return res;
}
var N1$1 = Math.pow(2, 7);
var N2$1 = Math.pow(2, 14);
var N3$1 = Math.pow(2, 21);
var N4$1 = Math.pow(2, 28);
var N5$1 = Math.pow(2, 35);
var N6$1 = Math.pow(2, 42);
var N7$1 = Math.pow(2, 49);
var N8$1 = Math.pow(2, 56);
var N9$1 = Math.pow(2, 63);
var length$1 = function (value) {
  return value < N1$1 ? 1 : value < N2$1 ? 2 : value < N3$1 ? 3 : value < N4$1 ? 4 : value < N5$1 ? 5 : value < N6$1 ? 6 : value < N7$1 ? 7 : value < N8$1 ? 8 : value < N9$1 ? 9 : 10;
};
var varint$1 = {
  encode: encode_1$1,
  decode: decode$6,
  encodingLength: length$1
};
var _brrp_varint$1 = varint$1;

const decode$5 = (data, offset = 0) => {
  const code = _brrp_varint$1.decode(data, offset);
  return [
    code,
    _brrp_varint$1.decode.bytes
  ];
};
const encodeTo$1 = (int, target, offset = 0) => {
  _brrp_varint$1.encode(int, target, offset);
  return target;
};
const encodingLength$1 = int => {
  return _brrp_varint$1.encodingLength(int);
};

const equals$1 = (aa, bb) => {
  if (aa === bb)
    return true;
  if (aa.byteLength !== bb.byteLength) {
    return false;
  }
  for (let ii = 0; ii < aa.byteLength; ii++) {
    if (aa[ii] !== bb[ii]) {
      return false;
    }
  }
  return true;
};
const coerce$1 = o => {
  if (o instanceof Uint8Array && o.constructor.name === 'Uint8Array')
    return o;
  if (o instanceof ArrayBuffer)
    return new Uint8Array(o);
  if (ArrayBuffer.isView(o)) {
    return new Uint8Array(o.buffer, o.byteOffset, o.byteLength);
  }
  throw new Error('Unknown type, must be binary type');
};

const create$2 = (code, digest) => {
  const size = digest.byteLength;
  const sizeOffset = encodingLength$1(code);
  const digestOffset = sizeOffset + encodingLength$1(size);
  const bytes = new Uint8Array(digestOffset + size);
  encodeTo$1(code, bytes, 0);
  encodeTo$1(size, bytes, sizeOffset);
  bytes.set(digest, digestOffset);
  return new Digest$1(code, size, digest, bytes);
};
const decode$4 = multihash => {
  const bytes = coerce$1(multihash);
  const [code, sizeOffset] = decode$5(bytes);
  const [size, digestOffset] = decode$5(bytes.subarray(sizeOffset));
  const digest = bytes.subarray(sizeOffset + digestOffset);
  if (digest.byteLength !== size) {
    throw new Error('Incorrect length');
  }
  return new Digest$1(code, size, digest, bytes);
};
const equals = (a, b) => {
  if (a === b) {
    return true;
  } else {
    return a.code === b.code && a.size === b.size && equals$1(a.bytes, b.bytes);
  }
};
class Digest$1 {
  constructor(code, size, digest, bytes) {
    this.code = code;
    this.size = size;
    this.digest = digest;
    this.bytes = bytes;
  }
}

function base$1(ALPHABET, name) {
  if (ALPHABET.length >= 255) {
    throw new TypeError('Alphabet too long');
  }
  var BASE_MAP = new Uint8Array(256);
  for (var j = 0; j < BASE_MAP.length; j++) {
    BASE_MAP[j] = 255;
  }
  for (var i = 0; i < ALPHABET.length; i++) {
    var x = ALPHABET.charAt(i);
    var xc = x.charCodeAt(0);
    if (BASE_MAP[xc] !== 255) {
      throw new TypeError(x + ' is ambiguous');
    }
    BASE_MAP[xc] = i;
  }
  var BASE = ALPHABET.length;
  var LEADER = ALPHABET.charAt(0);
  var FACTOR = Math.log(BASE) / Math.log(256);
  var iFACTOR = Math.log(256) / Math.log(BASE);
  function encode(source) {
    if (source instanceof Uint8Array);
    else if (ArrayBuffer.isView(source)) {
      source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    } else if (Array.isArray(source)) {
      source = Uint8Array.from(source);
    }
    if (!(source instanceof Uint8Array)) {
      throw new TypeError('Expected Uint8Array');
    }
    if (source.length === 0) {
      return '';
    }
    var zeroes = 0;
    var length = 0;
    var pbegin = 0;
    var pend = source.length;
    while (pbegin !== pend && source[pbegin] === 0) {
      pbegin++;
      zeroes++;
    }
    var size = (pend - pbegin) * iFACTOR + 1 >>> 0;
    var b58 = new Uint8Array(size);
    while (pbegin !== pend) {
      var carry = source[pbegin];
      var i = 0;
      for (var it1 = size - 1; (carry !== 0 || i < length) && it1 !== -1; it1--, i++) {
        carry += 256 * b58[it1] >>> 0;
        b58[it1] = carry % BASE >>> 0;
        carry = carry / BASE >>> 0;
      }
      if (carry !== 0) {
        throw new Error('Non-zero carry');
      }
      length = i;
      pbegin++;
    }
    var it2 = size - length;
    while (it2 !== size && b58[it2] === 0) {
      it2++;
    }
    var str = LEADER.repeat(zeroes);
    for (; it2 < size; ++it2) {
      str += ALPHABET.charAt(b58[it2]);
    }
    return str;
  }
  function decodeUnsafe(source) {
    if (typeof source !== 'string') {
      throw new TypeError('Expected String');
    }
    if (source.length === 0) {
      return new Uint8Array();
    }
    var psz = 0;
    if (source[psz] === ' ') {
      return;
    }
    var zeroes = 0;
    var length = 0;
    while (source[psz] === LEADER) {
      zeroes++;
      psz++;
    }
    var size = (source.length - psz) * FACTOR + 1 >>> 0;
    var b256 = new Uint8Array(size);
    while (source[psz]) {
      var carry = BASE_MAP[source.charCodeAt(psz)];
      if (carry === 255) {
        return;
      }
      var i = 0;
      for (var it3 = size - 1; (carry !== 0 || i < length) && it3 !== -1; it3--, i++) {
        carry += BASE * b256[it3] >>> 0;
        b256[it3] = carry % 256 >>> 0;
        carry = carry / 256 >>> 0;
      }
      if (carry !== 0) {
        throw new Error('Non-zero carry');
      }
      length = i;
      psz++;
    }
    if (source[psz] === ' ') {
      return;
    }
    var it4 = size - length;
    while (it4 !== size && b256[it4] === 0) {
      it4++;
    }
    var vch = new Uint8Array(zeroes + (size - it4));
    var j = zeroes;
    while (it4 !== size) {
      vch[j++] = b256[it4++];
    }
    return vch;
  }
  function decode(string) {
    var buffer = decodeUnsafe(string);
    if (buffer) {
      return buffer;
    }
    throw new Error(`Non-${ name } character`);
  }
  return {
    encode: encode,
    decodeUnsafe: decodeUnsafe,
    decode: decode
  };
}
var src$1 = base$1;
var _brrp__multiformats_scope_baseX$1 = src$1;

class Encoder$1 {
  constructor(name, prefix, baseEncode) {
    this.name = name;
    this.prefix = prefix;
    this.baseEncode = baseEncode;
  }
  encode(bytes) {
    if (bytes instanceof Uint8Array) {
      return `${ this.prefix }${ this.baseEncode(bytes) }`;
    } else {
      throw Error('Unknown type, must be binary type');
    }
  }
}
class Decoder$1 {
  constructor(name, prefix, baseDecode) {
    this.name = name;
    this.prefix = prefix;
    if (prefix.codePointAt(0) === undefined) {
      throw new Error('Invalid prefix character');
    }
    this.prefixCodePoint = prefix.codePointAt(0);
    this.baseDecode = baseDecode;
  }
  decode(text) {
    if (typeof text === 'string') {
      if (text.codePointAt(0) !== this.prefixCodePoint) {
        throw Error(`Unable to decode multibase string ${ JSON.stringify(text) }, ${ this.name } decoder only supports inputs prefixed with ${ this.prefix }`);
      }
      return this.baseDecode(text.slice(this.prefix.length));
    } else {
      throw Error('Can only multibase decode strings');
    }
  }
  or(decoder) {
    return or$1(this, decoder);
  }
}
class ComposedDecoder$1 {
  constructor(decoders) {
    this.decoders = decoders;
  }
  or(decoder) {
    return or$1(this, decoder);
  }
  decode(input) {
    const prefix = input[0];
    const decoder = this.decoders[prefix];
    if (decoder) {
      return decoder.decode(input);
    } else {
      throw RangeError(`Unable to decode multibase string ${ JSON.stringify(input) }, only inputs prefixed with ${ Object.keys(this.decoders) } are supported`);
    }
  }
}
const or$1 = (left, right) => new ComposedDecoder$1({
  ...left.decoders || { [left.prefix]: left },
  ...right.decoders || { [right.prefix]: right }
});
class Codec$1 {
  constructor(name, prefix, baseEncode, baseDecode) {
    this.name = name;
    this.prefix = prefix;
    this.baseEncode = baseEncode;
    this.baseDecode = baseDecode;
    this.encoder = new Encoder$1(name, prefix, baseEncode);
    this.decoder = new Decoder$1(name, prefix, baseDecode);
  }
  encode(input) {
    return this.encoder.encode(input);
  }
  decode(input) {
    return this.decoder.decode(input);
  }
}
const from$2 = ({name, prefix, encode, decode}) => new Codec$1(name, prefix, encode, decode);
const baseX$1 = ({prefix, name, alphabet}) => {
  const {encode, decode} = _brrp__multiformats_scope_baseX$1(alphabet, name);
  return from$2({
    prefix,
    name,
    encode,
    decode: text => coerce$1(decode(text))
  });
};
const decode$3 = (string, alphabet, bitsPerChar, name) => {
  const codes = {};
  for (let i = 0; i < alphabet.length; ++i) {
    codes[alphabet[i]] = i;
  }
  let end = string.length;
  while (string[end - 1] === '=') {
    --end;
  }
  const out = new Uint8Array(end * bitsPerChar / 8 | 0);
  let bits = 0;
  let buffer = 0;
  let written = 0;
  for (let i = 0; i < end; ++i) {
    const value = codes[string[i]];
    if (value === undefined) {
      throw new SyntaxError(`Non-${ name } character`);
    }
    buffer = buffer << bitsPerChar | value;
    bits += bitsPerChar;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = 255 & buffer >> bits;
    }
  }
  if (bits >= bitsPerChar || 255 & buffer << 8 - bits) {
    throw new SyntaxError('Unexpected end of data');
  }
  return out;
};
const encode$3 = (data, alphabet, bitsPerChar) => {
  const pad = alphabet[alphabet.length - 1] === '=';
  const mask = (1 << bitsPerChar) - 1;
  let out = '';
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < data.length; ++i) {
    buffer = buffer << 8 | data[i];
    bits += 8;
    while (bits > bitsPerChar) {
      bits -= bitsPerChar;
      out += alphabet[mask & buffer >> bits];
    }
  }
  if (bits) {
    out += alphabet[mask & buffer << bitsPerChar - bits];
  }
  if (pad) {
    while (out.length * bitsPerChar & 7) {
      out += '=';
    }
  }
  return out;
};
const rfc4648$1 = ({name, prefix, bitsPerChar, alphabet}) => {
  return from$2({
    prefix,
    name,
    encode(input) {
      return encode$3(input, alphabet, bitsPerChar);
    },
    decode(input) {
      return decode$3(input, alphabet, bitsPerChar, name);
    }
  });
};

const base58btc = baseX$1({
  name: 'base58btc',
  prefix: 'z',
  alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
});
baseX$1({
  name: 'base58flickr',
  prefix: 'Z',
  alphabet: '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
});

const base32 = rfc4648$1({
  prefix: 'b',
  name: 'base32',
  alphabet: 'abcdefghijklmnopqrstuvwxyz234567',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'B',
  name: 'base32upper',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'c',
  name: 'base32pad',
  alphabet: 'abcdefghijklmnopqrstuvwxyz234567=',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'C',
  name: 'base32padupper',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'v',
  name: 'base32hex',
  alphabet: '0123456789abcdefghijklmnopqrstuv',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'V',
  name: 'base32hexupper',
  alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUV',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 't',
  name: 'base32hexpad',
  alphabet: '0123456789abcdefghijklmnopqrstuv=',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'T',
  name: 'base32hexpadupper',
  alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUV=',
  bitsPerChar: 5
});
rfc4648$1({
  prefix: 'h',
  name: 'base32z',
  alphabet: 'ybndrfg8ejkmcpqxot1uwisza345h769',
  bitsPerChar: 5
});

class CID {
  constructor(version, code, multihash, bytes) {
    this.code = code;
    this.version = version;
    this.multihash = multihash;
    this.bytes = bytes;
    this.byteOffset = bytes.byteOffset;
    this.byteLength = bytes.byteLength;
    this.asCID = this;
    this._baseCache = new Map();
    Object.defineProperties(this, {
      byteOffset: hidden,
      byteLength: hidden,
      code: readonly,
      version: readonly,
      multihash: readonly,
      bytes: readonly,
      _baseCache: hidden,
      asCID: hidden
    });
  }
  toV0() {
    switch (this.version) {
    case 0: {
        return this;
      }
    default: {
        const {code, multihash} = this;
        if (code !== DAG_PB_CODE) {
          throw new Error('Cannot convert a non dag-pb CID to CIDv0');
        }
        if (multihash.code !== SHA_256_CODE) {
          throw new Error('Cannot convert non sha2-256 multihash CID to CIDv0');
        }
        return CID.createV0(multihash);
      }
    }
  }
  toV1() {
    switch (this.version) {
    case 0: {
        const {code, digest} = this.multihash;
        const multihash = create$2(code, digest);
        return CID.createV1(this.code, multihash);
      }
    case 1: {
        return this;
      }
    default: {
        throw Error(`Can not convert CID version ${ this.version } to version 0. This is a bug please report`);
      }
    }
  }
  equals(other) {
    return other && this.code === other.code && this.version === other.version && equals(this.multihash, other.multihash);
  }
  toString(base) {
    const {bytes, version, _baseCache} = this;
    switch (version) {
    case 0:
      return toStringV0(bytes, _baseCache, base || base58btc.encoder);
    default:
      return toStringV1(bytes, _baseCache, base || base32.encoder);
    }
  }
  toJSON() {
    return {
      code: this.code,
      version: this.version,
      hash: this.multihash.bytes
    };
  }
  get [Symbol.toStringTag]() {
    return 'CID';
  }
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return 'CID(' + this.toString() + ')';
  }
  static isCID(value) {
    deprecate(/^0\.0/, IS_CID_DEPRECATION);
    return !!(value && (value[cidSymbol] || value.asCID === value));
  }
  get toBaseEncodedString() {
    throw new Error('Deprecated, use .toString()');
  }
  get codec() {
    throw new Error('"codec" property is deprecated, use integer "code" property instead');
  }
  get buffer() {
    throw new Error('Deprecated .buffer property, use .bytes to get Uint8Array instead');
  }
  get multibaseName() {
    throw new Error('"multibaseName" property is deprecated');
  }
  get prefix() {
    throw new Error('"prefix" property is deprecated');
  }
  static asCID(value) {
    if (value instanceof CID) {
      return value;
    } else if (value != null && value.asCID === value) {
      const {version, code, multihash, bytes} = value;
      return new CID(version, code, multihash, bytes || encodeCID(version, code, multihash.bytes));
    } else if (value != null && value[cidSymbol] === true) {
      const {version, multihash, code} = value;
      const digest = decode$4(multihash);
      return CID.create(version, code, digest);
    } else {
      return null;
    }
  }
  static create(version, code, digest) {
    if (typeof code !== 'number') {
      throw new Error('String codecs are no longer supported');
    }
    switch (version) {
    case 0: {
        if (code !== DAG_PB_CODE) {
          throw new Error(`Version 0 CID must use dag-pb (code: ${ DAG_PB_CODE }) block encoding`);
        } else {
          return new CID(version, code, digest, digest.bytes);
        }
      }
    case 1: {
        const bytes = encodeCID(version, code, digest.bytes);
        return new CID(version, code, digest, bytes);
      }
    default: {
        throw new Error('Invalid version');
      }
    }
  }
  static createV0(digest) {
    return CID.create(0, DAG_PB_CODE, digest);
  }
  static createV1(code, digest) {
    return CID.create(1, code, digest);
  }
  static decode(bytes) {
    const [cid, remainder] = CID.decodeFirst(bytes);
    if (remainder.length) {
      throw new Error('Incorrect length');
    }
    return cid;
  }
  static decodeFirst(bytes) {
    const specs = CID.inspectBytes(bytes);
    const prefixSize = specs.size - specs.multihashSize;
    const multihashBytes = coerce$1(bytes.subarray(prefixSize, prefixSize + specs.multihashSize));
    if (multihashBytes.byteLength !== specs.multihashSize) {
      throw new Error('Incorrect length');
    }
    const digestBytes = multihashBytes.subarray(specs.multihashSize - specs.digestSize);
    const digest = new Digest$1(specs.multihashCode, specs.digestSize, digestBytes, multihashBytes);
    const cid = specs.version === 0 ? CID.createV0(digest) : CID.createV1(specs.codec, digest);
    return [
      cid,
      bytes.subarray(specs.size)
    ];
  }
  static inspectBytes(initialBytes) {
    let offset = 0;
    const next = () => {
      const [i, length] = decode$5(initialBytes.subarray(offset));
      offset += length;
      return i;
    };
    let version = next();
    let codec = DAG_PB_CODE;
    if (version === 18) {
      version = 0;
      offset = 0;
    } else if (version === 1) {
      codec = next();
    }
    if (version !== 0 && version !== 1) {
      throw new RangeError(`Invalid CID version ${ version }`);
    }
    const prefixSize = offset;
    const multihashCode = next();
    const digestSize = next();
    const size = offset + digestSize;
    const multihashSize = size - prefixSize;
    return {
      version,
      codec,
      multihashCode,
      digestSize,
      multihashSize,
      size
    };
  }
  static parse(source, base) {
    const [prefix, bytes] = parseCIDtoBytes(source, base);
    const cid = CID.decode(bytes);
    cid._baseCache.set(prefix, source);
    return cid;
  }
}
const parseCIDtoBytes = (source, base) => {
  switch (source[0]) {
  case 'Q': {
      const decoder = base || base58btc;
      return [
        base58btc.prefix,
        decoder.decode(`${ base58btc.prefix }${ source }`)
      ];
    }
  case base58btc.prefix: {
      const decoder = base || base58btc;
      return [
        base58btc.prefix,
        decoder.decode(source)
      ];
    }
  case base32.prefix: {
      const decoder = base || base32;
      return [
        base32.prefix,
        decoder.decode(source)
      ];
    }
  default: {
      if (base == null) {
        throw Error('To parse non base32 or base58btc encoded CID multibase decoder must be provided');
      }
      return [
        source[0],
        base.decode(source)
      ];
    }
  }
};
const toStringV0 = (bytes, cache, base) => {
  const {prefix} = base;
  if (prefix !== base58btc.prefix) {
    throw Error(`Cannot string encode V0 in ${ base.name } encoding`);
  }
  const cid = cache.get(prefix);
  if (cid == null) {
    const cid = base.encode(bytes).slice(1);
    cache.set(prefix, cid);
    return cid;
  } else {
    return cid;
  }
};
const toStringV1 = (bytes, cache, base) => {
  const {prefix} = base;
  const cid = cache.get(prefix);
  if (cid == null) {
    const cid = base.encode(bytes);
    cache.set(prefix, cid);
    return cid;
  } else {
    return cid;
  }
};
const DAG_PB_CODE = 112;
const SHA_256_CODE = 18;
const encodeCID = (version, code, multihash) => {
  const codeOffset = encodingLength$1(version);
  const hashOffset = codeOffset + encodingLength$1(code);
  const bytes = new Uint8Array(hashOffset + multihash.byteLength);
  encodeTo$1(version, bytes, 0);
  encodeTo$1(code, bytes, codeOffset);
  bytes.set(multihash, hashOffset);
  return bytes;
};
const cidSymbol = Symbol.for('@ipld/js-cid/CID');
const readonly = {
  writable: false,
  configurable: false,
  enumerable: true
};
const hidden = {
  writable: false,
  enumerable: false,
  configurable: false
};
const version = '0.0.0-dev';
const deprecate = (range, message) => {
  if (range.test(version)) {
    console.warn(message);
  } else {
    throw new Error(message);
  }
};
const IS_CID_DEPRECATION = `CID.isCID(v) is deprecated and will be removed in the next major release.
Following code pattern:

if (CID.isCID(value)) {
  doSomethingWithCID(value)
}

Is replaced with:

const cid = CID.asCID(value)
if (cid) {
  // Make sure to use cid instead of value
  doSomethingWithCID(cid)
}
`;

const CID_CBOR_TAG = 42;
function cidEncoder(obj) {
  if (obj.asCID !== obj) {
    return null;
  }
  const cid = CID.asCID(obj);
  if (!cid) {
    return null;
  }
  const bytes = new Uint8Array(cid.bytes.byteLength + 1);
  bytes.set(cid.bytes, 1);
  return [
    new Token(Type.tag, CID_CBOR_TAG),
    new Token(Type.bytes, bytes)
  ];
}
function undefinedEncoder() {
  throw new Error('`undefined` is not supported by the IPLD Data Model and cannot be encoded');
}
function numberEncoder(num) {
  if (Number.isNaN(num)) {
    throw new Error('`NaN` is not supported by the IPLD Data Model and cannot be encoded');
  }
  if (num === Infinity || num === -Infinity) {
    throw new Error('`Infinity` and `-Infinity` is not supported by the IPLD Data Model and cannot be encoded');
  }
  return null;
}
const encodeOptions = {
  float64: true,
  typeEncoders: {
    Object: cidEncoder,
    undefined: undefinedEncoder,
    number: numberEncoder
  }
};
function cidDecoder(bytes) {
  if (bytes[0] !== 0) {
    throw new Error('Invalid CID for CBOR tag 42; expected leading 0x00');
  }
  return CID.decode(bytes.subarray(1));
}
const decodeOptions = {
  allowIndefinite: false,
  allowUndefined: false,
  allowNaN: false,
  allowInfinity: false,
  allowBigInt: true,
  strict: true,
  useMaps: false,
  tags: []
};
decodeOptions.tags[CID_CBOR_TAG] = cidDecoder;
const encode$2 = node => encode$5(node, encodeOptions);
const decode$2 = data => decode$7(data, decodeOptions);

/**
 * Returns a `Uint8Array` of the requested size. Referenced memory will
 * be initialized to 0.
 */
/**
 * Where possible returns a Uint8Array of the requested size that references
 * uninitialized memory. Only use if you are certain you will immediately
 * overwrite every value in the returned `Uint8Array`.
 */
function allocUnsafe(size = 0) {
    return new Uint8Array(size);
}

/**
 * To guarantee Uint8Array semantics, convert nodejs Buffers
 * into vanilla Uint8Arrays
 */
function asUint8Array(buf) {
    return buf;
}

/**
 * Returns a new Uint8Array created by concatenating the passed Uint8Arrays
 */
function concat(arrays, length) {
    if (length == null) {
        length = arrays.reduce((acc, curr) => acc + curr.length, 0);
    }
    const output = allocUnsafe(length);
    let offset = 0;
    for (const arr of arrays) {
        output.set(arr, offset);
        offset += arr.length;
    }
    return asUint8Array(output);
}

/**
 * @packageDocumentation
 *
 * For when you need a one-liner to collect iterable values.
 *
 * @example
 *
 * ```javascript
 * import all from 'it-all'
 *
 * // This can also be an iterator, etc
 * const values = function * () {
 *   yield * [0, 1, 2, 3, 4]
 * }
 *
 * const arr = all(values)
 *
 * console.info(arr) // 0, 1, 2, 3, 4
 * ```
 *
 * Async sources must be awaited:
 *
 * ```javascript
 * const values = async function * () {
 *   yield * [0, 1, 2, 3, 4]
 * }
 *
 * const arr = await all(values())
 *
 * console.info(arr) // 0, 1, 2, 3, 4
 * ```
 */
function isAsyncIterable(thing) {
    return thing[Symbol.asyncIterator] != null;
}
function all(source) {
    if (isAsyncIterable(source)) {
        return (async () => {
            const arr = [];
            for await (const entry of source) {
                arr.push(entry);
            }
            return arr;
        })();
    }
    const arr = [];
    for (const entry of source) {
        arr.push(entry);
    }
    return arr;
}

/**
 * Internal assertion helpers.
 * @module
 */
/** Asserts something is positive integer. */
function anumber(n) {
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error('positive integer expected, got ' + n);
}
/** Is number an Uint8Array? Copied from utils for perf. */
function isBytes(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is Uint8Array. */
function abytes(b, ...lengths) {
    if (!isBytes(b))
        throw new Error('Uint8Array expected');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error('Uint8Array expected of length ' + lengths + ', got length=' + b.length);
}
/** Asserts a hash instance has not been destroyed / finished */
function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
/** Asserts output is properly-sized byte array */
function aoutput(out, instance) {
    abytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error('digestInto() expects output buffer of length at least ' + min);
    }
}

/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
// Cast array to different type
function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}
function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/** The rotate right (circular right shift) operation for uint32 */
function rotr(word, shift) {
    return (word << (32 - shift)) | (word >>> shift);
}
/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
// The byte swap operation for uint32
function byteSwap(word) {
    return (((word << 24) & 0xff000000) |
        ((word << 8) & 0xff0000) |
        ((word >>> 8) & 0xff00) |
        ((word >>> 24) & 0xff));
}
/** Conditionally byte swap if on a big-endian platform */
const byteSwapIfBE = isLE
    ? (n) => n
    : (n) => byteSwap(n);
/** In place byte swap for Uint32Array */
function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
        arr[i] = byteSwap(arr[i]);
    }
}
/**
 * Convert JS string to byte array.
 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new Error('utf8ToBytes expected string, got ' + typeof str);
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
 * Warning: when Uint8Array is passed, it would NOT get copied.
 * Keep in mind for future mutable operations.
 */
function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes(data);
    abytes(data);
    return data;
}
/** For runtime check if class implements interface */
class Hash {
    // Safe version that clones internal state
    clone() {
        return this._cloneInto();
    }
}
function wrapXOFConstructorWithOpts(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
}

/**
 * Internal helpers for blake hash.
 * @module
 */
/** Class, from which others are subclassed. */
class BLAKE extends Hash {
    constructor(blockLen, outputLen, opts = {}, keyLen, saltLen, persLen) {
        super();
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.length = 0;
        this.pos = 0;
        this.finished = false;
        this.destroyed = false;
        anumber(blockLen);
        anumber(outputLen);
        anumber(keyLen);
        if (outputLen < 0 || outputLen > keyLen)
            throw new Error('outputLen bigger than keyLen');
        if (opts.key !== undefined && (opts.key.length < 1 || opts.key.length > keyLen))
            throw new Error('key length must be undefined or 1..' + keyLen);
        if (opts.salt !== undefined && opts.salt.length !== saltLen)
            throw new Error('salt must be undefined or ' + saltLen);
        if (opts.personalization !== undefined && opts.personalization.length !== persLen)
            throw new Error('personalization must be undefined or ' + persLen);
        this.buffer = new Uint8Array(blockLen);
        this.buffer32 = u32(this.buffer);
    }
    update(data) {
        aexists(this);
        // Main difference with other hashes: there is flag for last block,
        // so we cannot process current block before we know that there
        // is the next one. This significantly complicates logic and reduces ability
        // to do zero-copy processing
        const { blockLen, buffer, buffer32 } = this;
        data = toBytes(data);
        const len = data.length;
        const offset = data.byteOffset;
        const buf = data.buffer;
        for (let pos = 0; pos < len;) {
            // If buffer is full and we still have input (don't process last block, same as blake2s)
            if (this.pos === blockLen) {
                if (!isLE)
                    byteSwap32(buffer32);
                this.compress(buffer32, 0, false);
                if (!isLE)
                    byteSwap32(buffer32);
                this.pos = 0;
            }
            const take = Math.min(blockLen - this.pos, len - pos);
            const dataOffset = offset + pos;
            // full block && aligned to 4 bytes && not last in input
            if (take === blockLen && !(dataOffset % 4) && pos + take < len) {
                const data32 = new Uint32Array(buf, dataOffset, Math.floor((len - pos) / 4));
                if (!isLE)
                    byteSwap32(data32);
                for (let pos32 = 0; pos + blockLen < len; pos32 += buffer32.length, pos += blockLen) {
                    this.length += blockLen;
                    this.compress(data32, pos32, false);
                }
                if (!isLE)
                    byteSwap32(data32);
                continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            this.length += take;
            pos += take;
        }
        return this;
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        const { pos, buffer32 } = this;
        this.finished = true;
        // Padding
        this.buffer.subarray(pos).fill(0);
        if (!isLE)
            byteSwap32(buffer32);
        this.compress(buffer32, 0, true);
        if (!isLE)
            byteSwap32(buffer32);
        const out32 = u32(out);
        this.get().forEach((v, i) => (out32[i] = byteSwapIfBE(v)));
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneInto(to) {
        const { buffer, length, finished, destroyed, outputLen, pos } = this;
        to || (to = new this.constructor({ dkLen: outputLen }));
        to.set(...this.get());
        to.length = length;
        to.finished = finished;
        to.destroyed = destroyed;
        to.outputLen = outputLen;
        to.buffer.set(buffer);
        to.pos = pos;
        return to;
    }
}

/**
 * Internal helpers for u64. BigUint64Array is too slow as per 2025, so we implement it using Uint32Array.
 * @todo re-check https://issues.chromium.org/issues/42212588
 * @module
 */
const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
const _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}

/**
 * Blake2s hash function. Focuses on 8-bit to 32-bit platforms. blake2b for 64-bit, but in JS it is slower.
 * @module
 */
/**
 * Initial state: same as SHA256. First 32 bits of the fractional parts of the square roots
 * of the first 8 primes 2..19.
 */
// prettier-ignore
const B2S_IV = /* @__PURE__ */ new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
// Mixing function G splitted in two halfs
function G1s(a, b, c, d, x) {
    a = (a + b + x) | 0;
    d = rotr(d ^ a, 16);
    c = (c + d) | 0;
    b = rotr(b ^ c, 12);
    return { a, b, c, d };
}
function G2s(a, b, c, d, x) {
    a = (a + b + x) | 0;
    d = rotr(d ^ a, 8);
    c = (c + d) | 0;
    b = rotr(b ^ c, 7);
    return { a, b, c, d };
}
// prettier-ignore
function compress(s, offset, msg, rounds, v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15) {
    let j = 0;
    for (let i = 0; i < rounds; i++) {
        ({ a: v0, b: v4, c: v8, d: v12 } = G1s(v0, v4, v8, v12, msg[offset + s[j++]]));
        ({ a: v0, b: v4, c: v8, d: v12 } = G2s(v0, v4, v8, v12, msg[offset + s[j++]]));
        ({ a: v1, b: v5, c: v9, d: v13 } = G1s(v1, v5, v9, v13, msg[offset + s[j++]]));
        ({ a: v1, b: v5, c: v9, d: v13 } = G2s(v1, v5, v9, v13, msg[offset + s[j++]]));
        ({ a: v2, b: v6, c: v10, d: v14 } = G1s(v2, v6, v10, v14, msg[offset + s[j++]]));
        ({ a: v2, b: v6, c: v10, d: v14 } = G2s(v2, v6, v10, v14, msg[offset + s[j++]]));
        ({ a: v3, b: v7, c: v11, d: v15 } = G1s(v3, v7, v11, v15, msg[offset + s[j++]]));
        ({ a: v3, b: v7, c: v11, d: v15 } = G2s(v3, v7, v11, v15, msg[offset + s[j++]]));
        ({ a: v0, b: v5, c: v10, d: v15 } = G1s(v0, v5, v10, v15, msg[offset + s[j++]]));
        ({ a: v0, b: v5, c: v10, d: v15 } = G2s(v0, v5, v10, v15, msg[offset + s[j++]]));
        ({ a: v1, b: v6, c: v11, d: v12 } = G1s(v1, v6, v11, v12, msg[offset + s[j++]]));
        ({ a: v1, b: v6, c: v11, d: v12 } = G2s(v1, v6, v11, v12, msg[offset + s[j++]]));
        ({ a: v2, b: v7, c: v8, d: v13 } = G1s(v2, v7, v8, v13, msg[offset + s[j++]]));
        ({ a: v2, b: v7, c: v8, d: v13 } = G2s(v2, v7, v8, v13, msg[offset + s[j++]]));
        ({ a: v3, b: v4, c: v9, d: v14 } = G1s(v3, v4, v9, v14, msg[offset + s[j++]]));
        ({ a: v3, b: v4, c: v9, d: v14 } = G2s(v3, v4, v9, v14, msg[offset + s[j++]]));
    }
    return { v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15 };
}

/**
 * Blake3 fast hash is Blake2 with reduced security (round count). Can also be used as MAC & KDF.
 *
 * It is advertised as "the fastest cryptographic hash". However, it isn't true in JS.
 * Why is this so slow? While it should be 6x faster than blake2b, perf diff is only 20%:
 *
 * * There is only 30% reduction in number of rounds from blake2s
 * * Speed-up comes from tree structure, which is parallelized using SIMD & threading.
 *   These features are not present in JS, so we only get overhead from trees.
 * * Parallelization only happens on 1024-byte chunks: there is no benefit for small inputs.
 * * It is still possible to make it faster using: a) loop unrolling b) web workers c) wasm
 * @module
 */
// Flag bitset
var B3_Flags;
(function (B3_Flags) {
    B3_Flags[B3_Flags["CHUNK_START"] = 1] = "CHUNK_START";
    B3_Flags[B3_Flags["CHUNK_END"] = 2] = "CHUNK_END";
    B3_Flags[B3_Flags["PARENT"] = 4] = "PARENT";
    B3_Flags[B3_Flags["ROOT"] = 8] = "ROOT";
    B3_Flags[B3_Flags["KEYED_HASH"] = 16] = "KEYED_HASH";
    B3_Flags[B3_Flags["DERIVE_KEY_CONTEXT"] = 32] = "DERIVE_KEY_CONTEXT";
    B3_Flags[B3_Flags["DERIVE_KEY_MATERIAL"] = 64] = "DERIVE_KEY_MATERIAL";
})(B3_Flags || (B3_Flags = {}));
const SIGMA = /* @__PURE__ */ (() => {
    const Id = Array.from({ length: 16 }, (_, i) => i);
    const permute = (arr) => [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8].map((i) => arr[i]);
    const res = [];
    for (let i = 0, v = Id; i < 7; i++, v = permute(v))
        res.push(...v);
    return Uint8Array.from(res);
})();
/** Blake3 hash. Can be used as MAC and KDF. */
class BLAKE3 extends BLAKE {
    constructor(opts = {}, flags = 0) {
        super(64, opts.dkLen === undefined ? 32 : opts.dkLen, {}, Number.MAX_SAFE_INTEGER, 0, 0);
        this.flags = 0 | 0;
        this.chunkPos = 0; // Position of current block in chunk
        this.chunksDone = 0; // How many chunks we already have
        this.stack = [];
        // Output
        this.posOut = 0;
        this.bufferOut32 = new Uint32Array(16);
        this.chunkOut = 0; // index of output chunk
        this.enableXOF = true;
        this.outputLen = opts.dkLen === undefined ? 32 : opts.dkLen;
        anumber(this.outputLen);
        if (opts.key !== undefined && opts.context !== undefined)
            throw new Error('Blake3: only key or context can be specified at same time');
        else if (opts.key !== undefined) {
            const key = toBytes(opts.key).slice();
            if (key.length !== 32)
                throw new Error('Blake3: key should be 32 byte');
            this.IV = u32(key);
            if (!isLE)
                byteSwap32(this.IV);
            this.flags = flags | B3_Flags.KEYED_HASH;
        }
        else if (opts.context !== undefined) {
            const context_key = new BLAKE3({ dkLen: 32 }, B3_Flags.DERIVE_KEY_CONTEXT)
                .update(opts.context)
                .digest();
            this.IV = u32(context_key);
            if (!isLE)
                byteSwap32(this.IV);
            this.flags = flags | B3_Flags.DERIVE_KEY_MATERIAL;
        }
        else {
            this.IV = B2S_IV.slice();
            this.flags = flags;
        }
        this.state = this.IV.slice();
        this.bufferOut = u8(this.bufferOut32);
    }
    // Unused
    get() {
        return [];
    }
    set() { }
    b2Compress(counter, flags, buf, bufPos = 0) {
        const { state: s, pos } = this;
        const { h, l } = fromBig(BigInt(counter), true);
        // prettier-ignore
        const { v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15 } = compress(SIGMA, bufPos, buf, 7, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], B2S_IV[0], B2S_IV[1], B2S_IV[2], B2S_IV[3], h, l, pos, flags);
        s[0] = v0 ^ v8;
        s[1] = v1 ^ v9;
        s[2] = v2 ^ v10;
        s[3] = v3 ^ v11;
        s[4] = v4 ^ v12;
        s[5] = v5 ^ v13;
        s[6] = v6 ^ v14;
        s[7] = v7 ^ v15;
    }
    compress(buf, bufPos = 0, isLast = false) {
        // Compress last block
        let flags = this.flags;
        if (!this.chunkPos)
            flags |= B3_Flags.CHUNK_START;
        if (this.chunkPos === 15 || isLast)
            flags |= B3_Flags.CHUNK_END;
        if (!isLast)
            this.pos = this.blockLen;
        this.b2Compress(this.chunksDone, flags, buf, bufPos);
        this.chunkPos += 1;
        // If current block is last in chunk (16 blocks), then compress chunks
        if (this.chunkPos === 16 || isLast) {
            let chunk = this.state;
            this.state = this.IV.slice();
            // If not the last one, compress only when there are trailing zeros in chunk counter
            // chunks used as binary tree where current stack is path. Zero means current leaf is finished and can be compressed.
            // 1 (001) - leaf not finished (just push current chunk to stack)
            // 2 (010) - leaf finished at depth=1 (merge with last elm on stack and push back)
            // 3 (011) - last leaf not finished
            // 4 (100) - leafs finished at depth=1 and depth=2
            for (let last, chunks = this.chunksDone + 1; isLast || !(chunks & 1); chunks >>= 1) {
                if (!(last = this.stack.pop()))
                    break;
                this.buffer32.set(last, 0);
                this.buffer32.set(chunk, 8);
                this.pos = this.blockLen;
                this.b2Compress(0, this.flags | B3_Flags.PARENT, this.buffer32, 0);
                chunk = this.state;
                this.state = this.IV.slice();
            }
            this.chunksDone++;
            this.chunkPos = 0;
            this.stack.push(chunk);
        }
        this.pos = 0;
    }
    _cloneInto(to) {
        to = super._cloneInto(to);
        const { IV, flags, state, chunkPos, posOut, chunkOut, stack, chunksDone } = this;
        to.state.set(state.slice());
        to.stack = stack.map((i) => Uint32Array.from(i));
        to.IV.set(IV);
        to.flags = flags;
        to.chunkPos = chunkPos;
        to.chunksDone = chunksDone;
        to.posOut = posOut;
        to.chunkOut = chunkOut;
        to.enableXOF = this.enableXOF;
        to.bufferOut32.set(this.bufferOut32);
        return to;
    }
    destroy() {
        this.destroyed = true;
        this.state.fill(0);
        this.buffer32.fill(0);
        this.IV.fill(0);
        this.bufferOut32.fill(0);
        for (let i of this.stack)
            i.fill(0);
    }
    // Same as b2Compress, but doesn't modify state and returns 16 u32 array (instead of 8)
    b2CompressOut() {
        const { state: s, pos, flags, buffer32, bufferOut32: out32 } = this;
        const { h, l } = fromBig(BigInt(this.chunkOut++));
        if (!isLE)
            byteSwap32(buffer32);
        // prettier-ignore
        const { v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15 } = compress(SIGMA, 0, buffer32, 7, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], B2S_IV[0], B2S_IV[1], B2S_IV[2], B2S_IV[3], l, h, pos, flags);
        out32[0] = v0 ^ v8;
        out32[1] = v1 ^ v9;
        out32[2] = v2 ^ v10;
        out32[3] = v3 ^ v11;
        out32[4] = v4 ^ v12;
        out32[5] = v5 ^ v13;
        out32[6] = v6 ^ v14;
        out32[7] = v7 ^ v15;
        out32[8] = s[0] ^ v8;
        out32[9] = s[1] ^ v9;
        out32[10] = s[2] ^ v10;
        out32[11] = s[3] ^ v11;
        out32[12] = s[4] ^ v12;
        out32[13] = s[5] ^ v13;
        out32[14] = s[6] ^ v14;
        out32[15] = s[7] ^ v15;
        if (!isLE) {
            byteSwap32(buffer32);
            byteSwap32(out32);
        }
        this.posOut = 0;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        // Padding
        this.buffer.fill(0, this.pos);
        // Process last chunk
        let flags = this.flags | B3_Flags.ROOT;
        if (this.stack.length) {
            flags |= B3_Flags.PARENT;
            if (!isLE)
                byteSwap32(this.buffer32);
            this.compress(this.buffer32, 0, true);
            if (!isLE)
                byteSwap32(this.buffer32);
            this.chunksDone = 0;
            this.pos = this.blockLen;
        }
        else {
            flags |= (!this.chunkPos ? B3_Flags.CHUNK_START : 0) | B3_Flags.CHUNK_END;
        }
        this.flags = flags;
        this.b2CompressOut();
    }
    writeInto(out) {
        aexists(this, false);
        abytes(out);
        this.finish();
        const { blockLen, bufferOut } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.b2CompressOut();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        if (!this.enableXOF)
            throw new Error('XOF is not possible after digest call');
        return this.writeInto(out);
    }
    xof(bytes) {
        anumber(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        aoutput(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        this.enableXOF = false;
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
}
/**
 * BLAKE3 hash function. Can be used as MAC and KDF.
 * @param msg - message that would be hashed
 * @param opts - `dkLen` for output length, `key` for MAC mode, `context` for KDF mode
 * @example
 * const data = new Uint8Array(32);
 * const hash = blake3(data);
 * const mac = blake3(data, { key: new Uint8Array(32) });
 * const kdf = blake3(data, { context: 'application name' });
 */
const blake3$1 = /* @__PURE__ */ wrapXOFConstructorWithOpts((opts) => new BLAKE3(opts));

function coerce(o) {
    if (o instanceof Uint8Array && o.constructor.name === 'Uint8Array')
        return o;
    if (o instanceof ArrayBuffer)
        return new Uint8Array(o);
    if (ArrayBuffer.isView(o)) {
        return new Uint8Array(o.buffer, o.byteOffset, o.byteLength);
    }
    throw new Error('Unknown type, must be binary type');
}

/* eslint-disable */
// base-x encoding / decoding
// Copyright (c) 2018 base-x contributors
// Copyright (c) 2014-2018 The Bitcoin Core developers (base58.cpp)
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
/**
 * @param {string} ALPHABET
 * @param {any} name
 */
function base(ALPHABET, name) {
    if (ALPHABET.length >= 255) {
        throw new TypeError('Alphabet too long');
    }
    var BASE_MAP = new Uint8Array(256);
    for (var j = 0; j < BASE_MAP.length; j++) {
        BASE_MAP[j] = 255;
    }
    for (var i = 0; i < ALPHABET.length; i++) {
        var x = ALPHABET.charAt(i);
        var xc = x.charCodeAt(0);
        if (BASE_MAP[xc] !== 255) {
            throw new TypeError(x + ' is ambiguous');
        }
        BASE_MAP[xc] = i;
    }
    var BASE = ALPHABET.length;
    var LEADER = ALPHABET.charAt(0);
    var FACTOR = Math.log(BASE) / Math.log(256); // log(BASE) / log(256), rounded up
    var iFACTOR = Math.log(256) / Math.log(BASE); // log(256) / log(BASE), rounded up
    /**
     * @param {any[] | Iterable<number>} source
     */
    function encode(source) {
        // @ts-ignore
        if (source instanceof Uint8Array)
            ;
        else if (ArrayBuffer.isView(source)) {
            source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        }
        else if (Array.isArray(source)) {
            source = Uint8Array.from(source);
        }
        if (!(source instanceof Uint8Array)) {
            throw new TypeError('Expected Uint8Array');
        }
        if (source.length === 0) {
            return '';
        }
        // Skip & count leading zeroes.
        var zeroes = 0;
        var length = 0;
        var pbegin = 0;
        var pend = source.length;
        while (pbegin !== pend && source[pbegin] === 0) {
            pbegin++;
            zeroes++;
        }
        // Allocate enough space in big-endian base58 representation.
        var size = ((pend - pbegin) * iFACTOR + 1) >>> 0;
        var b58 = new Uint8Array(size);
        // Process the bytes.
        while (pbegin !== pend) {
            var carry = source[pbegin];
            // Apply "b58 = b58 * 256 + ch".
            var i = 0;
            for (var it1 = size - 1; (carry !== 0 || i < length) && (it1 !== -1); it1--, i++) {
                carry += (256 * b58[it1]) >>> 0;
                b58[it1] = (carry % BASE) >>> 0;
                carry = (carry / BASE) >>> 0;
            }
            if (carry !== 0) {
                throw new Error('Non-zero carry');
            }
            length = i;
            pbegin++;
        }
        // Skip leading zeroes in base58 result.
        var it2 = size - length;
        while (it2 !== size && b58[it2] === 0) {
            it2++;
        }
        // Translate the result into a string.
        var str = LEADER.repeat(zeroes);
        for (; it2 < size; ++it2) {
            str += ALPHABET.charAt(b58[it2]);
        }
        return str;
    }
    /**
     * @param {string | string[]} source
     */
    function decodeUnsafe(source) {
        if (typeof source !== 'string') {
            throw new TypeError('Expected String');
        }
        if (source.length === 0) {
            return new Uint8Array();
        }
        var psz = 0;
        // Skip leading spaces.
        if (source[psz] === ' ') {
            return;
        }
        // Skip and count leading '1's.
        var zeroes = 0;
        var length = 0;
        while (source[psz] === LEADER) {
            zeroes++;
            psz++;
        }
        // Allocate enough space in big-endian base256 representation.
        var size = (((source.length - psz) * FACTOR) + 1) >>> 0; // log(58) / log(256), rounded up.
        var b256 = new Uint8Array(size);
        // Process the characters.
        while (source[psz]) {
            // Decode character
            var carry = BASE_MAP[source.charCodeAt(psz)];
            // Invalid character
            if (carry === 255) {
                return;
            }
            var i = 0;
            for (var it3 = size - 1; (carry !== 0 || i < length) && (it3 !== -1); it3--, i++) {
                carry += (BASE * b256[it3]) >>> 0;
                b256[it3] = (carry % 256) >>> 0;
                carry = (carry / 256) >>> 0;
            }
            if (carry !== 0) {
                throw new Error('Non-zero carry');
            }
            length = i;
            psz++;
        }
        // Skip trailing spaces.
        if (source[psz] === ' ') {
            return;
        }
        // Skip leading zeroes in b256.
        var it4 = size - length;
        while (it4 !== size && b256[it4] === 0) {
            it4++;
        }
        var vch = new Uint8Array(zeroes + (size - it4));
        var j = zeroes;
        while (it4 !== size) {
            vch[j++] = b256[it4++];
        }
        return vch;
    }
    /**
     * @param {string | string[]} string
     */
    function decode(string) {
        var buffer = decodeUnsafe(string);
        if (buffer) {
            return buffer;
        }
        throw new Error(`Non-${name} character`);
    }
    return {
        encode: encode,
        decodeUnsafe: decodeUnsafe,
        decode: decode
    };
}
var src = base;
var _brrp__multiformats_scope_baseX = src;

/**
 * Class represents both BaseEncoder and MultibaseEncoder meaning it
 * can be used to encode to multibase or base encode without multibase
 * prefix.
 */
class Encoder {
    name;
    prefix;
    baseEncode;
    constructor(name, prefix, baseEncode) {
        this.name = name;
        this.prefix = prefix;
        this.baseEncode = baseEncode;
    }
    encode(bytes) {
        if (bytes instanceof Uint8Array) {
            return `${this.prefix}${this.baseEncode(bytes)}`;
        }
        else {
            throw Error('Unknown type, must be binary type');
        }
    }
}
/**
 * Class represents both BaseDecoder and MultibaseDecoder so it could be used
 * to decode multibases (with matching prefix) or just base decode strings
 * with corresponding base encoding.
 */
class Decoder {
    name;
    prefix;
    baseDecode;
    prefixCodePoint;
    constructor(name, prefix, baseDecode) {
        this.name = name;
        this.prefix = prefix;
        const prefixCodePoint = prefix.codePointAt(0);
        /* c8 ignore next 3 */
        if (prefixCodePoint === undefined) {
            throw new Error('Invalid prefix character');
        }
        this.prefixCodePoint = prefixCodePoint;
        this.baseDecode = baseDecode;
    }
    decode(text) {
        if (typeof text === 'string') {
            if (text.codePointAt(0) !== this.prefixCodePoint) {
                throw Error(`Unable to decode multibase string ${JSON.stringify(text)}, ${this.name} decoder only supports inputs prefixed with ${this.prefix}`);
            }
            return this.baseDecode(text.slice(this.prefix.length));
        }
        else {
            throw Error('Can only multibase decode strings');
        }
    }
    or(decoder) {
        return or(this, decoder);
    }
}
class ComposedDecoder {
    decoders;
    constructor(decoders) {
        this.decoders = decoders;
    }
    or(decoder) {
        return or(this, decoder);
    }
    decode(input) {
        const prefix = input[0];
        const decoder = this.decoders[prefix];
        if (decoder != null) {
            return decoder.decode(input);
        }
        else {
            throw RangeError(`Unable to decode multibase string ${JSON.stringify(input)}, only inputs prefixed with ${Object.keys(this.decoders)} are supported`);
        }
    }
}
function or(left, right) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return new ComposedDecoder({
        ...(left.decoders ?? { [left.prefix]: left }),
        ...(right.decoders ?? { [right.prefix]: right })
    });
}
class Codec {
    name;
    prefix;
    baseEncode;
    baseDecode;
    encoder;
    decoder;
    constructor(name, prefix, baseEncode, baseDecode) {
        this.name = name;
        this.prefix = prefix;
        this.baseEncode = baseEncode;
        this.baseDecode = baseDecode;
        this.encoder = new Encoder(name, prefix, baseEncode);
        this.decoder = new Decoder(name, prefix, baseDecode);
    }
    encode(input) {
        return this.encoder.encode(input);
    }
    decode(input) {
        return this.decoder.decode(input);
    }
}
function from$1({ name, prefix, encode, decode }) {
    return new Codec(name, prefix, encode, decode);
}
function baseX({ name, prefix, alphabet }) {
    const { encode, decode } = _brrp__multiformats_scope_baseX(alphabet, name);
    return from$1({
        prefix,
        name,
        encode,
        decode: (text) => coerce(decode(text))
    });
}
function decode$1(string, alphabet, bitsPerChar, name) {
    // Build the character lookup table:
    const codes = {};
    for (let i = 0; i < alphabet.length; ++i) {
        codes[alphabet[i]] = i;
    }
    // Count the padding bytes:
    let end = string.length;
    while (string[end - 1] === '=') {
        --end;
    }
    // Allocate the output:
    const out = new Uint8Array((end * bitsPerChar / 8) | 0);
    // Parse the data:
    let bits = 0; // Number of bits currently in the buffer
    let buffer = 0; // Bits waiting to be written out, MSB first
    let written = 0; // Next byte to write
    for (let i = 0; i < end; ++i) {
        // Read one character from the string:
        const value = codes[string[i]];
        if (value === undefined) {
            throw new SyntaxError(`Non-${name} character`);
        }
        // Append the bits to the buffer:
        buffer = (buffer << bitsPerChar) | value;
        bits += bitsPerChar;
        // Write out some bits if the buffer has a byte's worth:
        if (bits >= 8) {
            bits -= 8;
            out[written++] = 0xff & (buffer >> bits);
        }
    }
    // Verify that we have received just enough bits:
    if (bits >= bitsPerChar || (0xff & (buffer << (8 - bits))) !== 0) {
        throw new SyntaxError('Unexpected end of data');
    }
    return out;
}
function encode$1(data, alphabet, bitsPerChar) {
    const pad = alphabet[alphabet.length - 1] === '=';
    const mask = (1 << bitsPerChar) - 1;
    let out = '';
    let bits = 0; // Number of bits currently in the buffer
    let buffer = 0; // Bits waiting to be written out, MSB first
    for (let i = 0; i < data.length; ++i) {
        // Slurp data into the buffer:
        buffer = (buffer << 8) | data[i];
        bits += 8;
        // Write out as much as we can:
        while (bits > bitsPerChar) {
            bits -= bitsPerChar;
            out += alphabet[mask & (buffer >> bits)];
        }
    }
    // Partial character:
    if (bits !== 0) {
        out += alphabet[mask & (buffer << (bitsPerChar - bits))];
    }
    // Add padding characters until we hit a byte boundary:
    if (pad) {
        while (((out.length * bitsPerChar) & 7) !== 0) {
            out += '=';
        }
    }
    return out;
}
/**
 * RFC4648 Factory
 */
function rfc4648({ name, prefix, bitsPerChar, alphabet }) {
    return from$1({
        prefix,
        name,
        encode(input) {
            return encode$1(input, alphabet, bitsPerChar);
        },
        decode(input) {
            return decode$1(input, alphabet, bitsPerChar, name);
        }
    });
}

rfc4648({
    prefix: 'b',
    name: 'base32',
    alphabet: 'abcdefghijklmnopqrstuvwxyz234567',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'B',
    name: 'base32upper',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'c',
    name: 'base32pad',
    alphabet: 'abcdefghijklmnopqrstuvwxyz234567=',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'C',
    name: 'base32padupper',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'v',
    name: 'base32hex',
    alphabet: '0123456789abcdefghijklmnopqrstuv',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'V',
    name: 'base32hexupper',
    alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUV',
    bitsPerChar: 5
});
rfc4648({
    prefix: 't',
    name: 'base32hexpad',
    alphabet: '0123456789abcdefghijklmnopqrstuv=',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'T',
    name: 'base32hexpadupper',
    alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUV=',
    bitsPerChar: 5
});
rfc4648({
    prefix: 'h',
    name: 'base32z',
    alphabet: 'ybndrfg8ejkmcpqxot1uwisza345h769',
    bitsPerChar: 5
});

baseX({
    prefix: 'k',
    name: 'base36',
    alphabet: '0123456789abcdefghijklmnopqrstuvwxyz'
});
baseX({
    prefix: 'K',
    name: 'base36upper',
    alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
});

baseX({
    name: 'base58btc',
    prefix: 'z',
    alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
});
baseX({
    name: 'base58flickr',
    prefix: 'Z',
    alphabet: '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
});

/* eslint-disable */
var encode_1 = encode;
var MSB = 0x80, REST = 0x7F, MSBALL = ~REST, INT = Math.pow(2, 31);
/**
 * @param {number} num
 * @param {number[]} out
 * @param {number} offset
 */
function encode(num, out, offset) {
    out = out || [];
    offset = offset || 0;
    var oldOffset = offset;
    while (num >= INT) {
        out[offset++] = (num & 0xFF) | MSB;
        num /= 128;
    }
    while (num & MSBALL) {
        out[offset++] = (num & 0xFF) | MSB;
        num >>>= 7;
    }
    out[offset] = num | 0;
    // @ts-ignore
    encode.bytes = offset - oldOffset + 1;
    return out;
}
var decode = read;
var MSB$1 = 0x80, REST$1 = 0x7F;
/**
 * @param {string | any[]} buf
 * @param {number} offset
 */
function read(buf, offset) {
    var res = 0, offset = offset || 0, shift = 0, counter = offset, b, l = buf.length;
    do {
        if (counter >= l) {
            // @ts-ignore
            read.bytes = 0;
            throw new RangeError('Could not decode varint');
        }
        b = buf[counter++];
        res += shift < 28
            ? (b & REST$1) << shift
            : (b & REST$1) * Math.pow(2, shift);
        shift += 7;
    } while (b >= MSB$1);
    // @ts-ignore
    read.bytes = counter - offset;
    return res;
}
var N1 = Math.pow(2, 7);
var N2 = Math.pow(2, 14);
var N3 = Math.pow(2, 21);
var N4 = Math.pow(2, 28);
var N5 = Math.pow(2, 35);
var N6 = Math.pow(2, 42);
var N7 = Math.pow(2, 49);
var N8 = Math.pow(2, 56);
var N9 = Math.pow(2, 63);
var length = function (/** @type {number} */ value) {
    return (value < N1 ? 1
        : value < N2 ? 2
            : value < N3 ? 3
                : value < N4 ? 4
                    : value < N5 ? 5
                        : value < N6 ? 6
                            : value < N7 ? 7
                                : value < N8 ? 8
                                    : value < N9 ? 9
                                        : 10);
};
var varint = {
    encode: encode_1,
    decode: decode,
    encodingLength: length
};
var _brrp_varint = varint;

function encodeTo(int, target, offset = 0) {
    _brrp_varint.encode(int, target, offset);
    return target;
}
function encodingLength(int) {
    return _brrp_varint.encodingLength(int);
}

/**
 * Creates a multihash digest.
 */
function create$1(code, digest) {
    const size = digest.byteLength;
    const sizeOffset = encodingLength(code);
    const digestOffset = sizeOffset + encodingLength(size);
    const bytes = new Uint8Array(digestOffset + size);
    encodeTo(code, bytes, 0);
    encodeTo(size, bytes, sizeOffset);
    bytes.set(digest, digestOffset);
    return new Digest(code, size, digest, bytes);
}
/**
 * Represents a multihash digest which carries information about the
 * hashing algorithm and an actual hash digest.
 */
class Digest {
    code;
    size;
    digest;
    bytes;
    /**
     * Creates a multihash digest.
     */
    constructor(code, size, digest, bytes) {
        this.code = code;
        this.size = size;
        this.digest = digest;
        this.bytes = bytes;
    }
}

function from({ name, code, encode }) {
    return new Hasher(name, code, encode);
}
/**
 * Hasher represents a hashing algorithm implementation that produces as
 * `MultihashDigest`.
 */
class Hasher {
    name;
    code;
    encode;
    constructor(name, code, encode) {
        this.name = name;
        this.code = code;
        this.encode = encode;
    }
    digest(input) {
        if (input instanceof Uint8Array) {
            const result = this.encode(input);
            return result instanceof Uint8Array
                ? create$1(this.code, result)
                /* c8 ignore next 1 */
                : result.then(digest => create$1(this.code, digest));
        }
        else {
            throw Error('Unknown type, must be binary type');
            /* c8 ignore next 1 */
        }
    }
}

// Node class for HAMT implementation
class Node {
    constructor() {
        this.data = {
            B: {}, // Buckets
            L: {} // Links
        };
    }
    getBuckets() {
        return this.data.B;
    }
    getLinks() {
        return this.data.L;
    }
    replaceLink(oldLink, newLink) {
        const links = this.getLinks();
        for (const strKey of Object.keys(links)) {
            if (links[strKey] === oldLink) {
                links[strKey] = newLink;
            }
        }
    }
    removeLink(oldLink) {
        const links = this.getLinks();
        for (const strKey of Object.keys(links)) {
            if (links[strKey] === oldLink) {
                delete links[strKey];
            }
        }
    }
    serialize() {
        return encode$2(this.data);
    }
    static deserialize(data) {
        try {
            const decoded = decode$2(data);
            if (decoded && typeof decoded === 'object' && 'B' in decoded && 'L' in decoded) {
                const node = new Node();
                node.data = decoded;
                return node;
            }
            throw new Error("Invalid node data structure");
        }
        catch {
            throw new Error("Invalid dag-cbor encoded data");
        }
    }
}
// Helper function to extract bits
function extractBits(hashBytes, depth, nbits) {
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
const blake3 = from({
    name: 'blake3',
    code: 0x1e,
    encode: (input) => blake3$1(input),
});
class IPFSStore {
    constructor(cid, ipfsElements) {
        // private maxBucketSize: number = 4;
        this.cache = new Map();
        this.maxCacheSize = 10000000; // 10MB
        this.cid = cid;
        this.ipfsElements = ipfsElements;
        this.rootNode = new Node();
    }
    async hashFn(input) {
        const encoder = new TextEncoder();
        const hashBytes = encoder.encode(input);
        return blake3.encode(hashBytes);
    }
    async writeNode(node) {
        const serialized = node.serialize();
        const cid = await this.ipfsElements.dagCbor.components.blockstore.put(serialized);
        this.cache.set(cid.toString(), node);
        this.maintainCacheSize();
        return cid;
    }
    async readNode(nodeId) {
        const cidStr = nodeId.toString();
        if (this.cache.has(cidStr)) {
            return this.cache.get(cidStr);
        }
        const bytes = await this.ipfsElements.dagCbor.components.blockstore.get(nodeId);
        const node = Node.deserialize(bytes);
        this.cache.set(cidStr, node);
        this.maintainCacheSize();
        return node;
    }
    maintainCacheSize() {
        // Simple LRU-like cache maintenance
        if (this.cache.size > this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            // check if the key is not undefined
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
    }
    async keys() {
        throw new Error("Method not implemented.");
    }
    // Json metadata
    async getMetadata(metadataInput = ".zmetadata") {
        const metadata = await this._findItemInNode(metadataInput);
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(metadata);
        return JSON.parse(jsonString);
    }
    async getBounds() {
        // Fetch metadata
        const metadata = await this.getMetadata();
        const attributes = metadata.metadata[".zattrs"];
        // Check if bbox on .zattrs and use that first
        if ("bbox" in attributes) {
            const [lonMin, latMin, lonMax, latMax] = attributes["bbox"];
            const dateStrings = attributes["date_range"];
            const spatialResolution = attributes["spatial_resolution"];
            const temporalResolution = attributes["temporal_resolution"];
            const boundingDatesArray = dateStrings.map((dateString) => {
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
        const lonMin = await zLon.get([0]);
        const lonMax = await zLon.get([lonChunkSize - 1]);
        const secondLon = await zLon.get([1]);
        // calculate spatial resolution
        const spatialResolution = Math.abs(secondLon - lonMin);
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
                }
                else if (unit === "hours") {
                    temporalResolution = "hourly";
                    timeMin = new Date(reference.getTime() + minTimeValue * 1000).toISOString();
                    timeMax = new Date(reference.getTime() + maxTimeValue * 1000).toISOString();
                }
                else if (unit === "months") {
                    temporalResolution = "monthly";
                    const minDate = new Date(reference);
                    minDate.setMonth(minDate.getMonth() + minTimeValue);
                    timeMin = minDate.toISOString();
                    const maxDate = new Date(reference);
                    maxDate.setMonth(maxDate.getMonth() + maxTimeValue);
                    timeMax = maxDate.toISOString();
                }
            }
            else {
                throw new Error("Time metadata missing");
            }
        }
        else {
            throw new Error(`Unsupported time unit: ${unit}`);
        }
        return { latMin, latMax, lonMin, lonMax, timeMin, timeMax, spatialResolution, temporalResolution };
    }
    async _findCIDInNode(item) {
        const hash = await this.hashFn(item);
        let currentNodeId = this.cid;
        let depth = 0;
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
    async _findItemInNode(item) {
        const hash = await this.hashFn(item);
        let currentNodeId = this.cid;
        let depth = 0;
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
                        const value = concat(await all(this.ipfsElements.unixfs.cat(kv[item])));
                        const decoded = decode$2(value);
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
    async getItem(item) {
        if (item === ".zgroup" || item.includes(".zarray")) {
            const response = await this.getMetadata(item);
            if (!response) {
                throw new KeyError(item);
            }
            const compressorId = response.compressor.id;
            if (compressorId === "zlib") {
                addCodec(Zlib$1.codecId, () => Zlib$1);
            }
            else if (compressorId === "blosc") {
                addCodec(Blosc$1.codecId, () => Blosc$1);
            }
            // const response = await thi
            // Decode
            return response;
        }
        const data = await this._findItemInNode(item);
        return data;
    }
    async setItem(_item) {
        throw new Error("Method not implemented.");
    }
    async deleteItem(_item) {
        throw new Error("Method not implemented.");
    }
    async containsItem(item) {
        try {
            await this.getItem(item);
            return true;
        }
        catch (e) {
            if (e instanceof KeyError) {
                return false;
            }
            throw e;
        }
    }
}

/**
 *
 * @param shape Array shape.
 * @param chunks  Chunk shape. If `true`, will be guessed from `shape` and `dtype`. If
 *      `false`, will be set to `shape`, i.e., single chunk for the whole array.
 *      If an int, the chunk size in each dimension will be given by the value
 *      of `chunks`. Default is `true`.
 * @param dtype NumPy dtype.
 * @param compressor Primary compressor.
 * @param fillValue Default value to use for uninitialized portions of the array.
 * @param order Memory layout to be used within each chunk.
 * @param store Store or path to directory in file system or name of zip file.
 * @param overwrite  If True, delete all pre-existing data in `store` at `path` before creating the array.
 * @param path Path under which array is stored.
 * @param chunkStore Separate storage for chunks. If not provided, `store` will be used for storage of both chunks and metadata.
 * @param filters Sequence of filters to use to encode chunk data prior to compression.
 * @param cacheMetadata If `true` (default), array configuration metadata will be cached for the
 *      lifetime of the object. If `false`, array metadata will be reloaded
 *      prior to all data access and modification operations (may incur
 *      overhead depending on storage and data access pattern).
 * @param cacheAttrs If `true` (default), user attributes will be cached for attribute read
 *      operations. If `false`, user attributes are reloaded from the store prior
 *      to all attribute read operations.
 * @param readOnly `true` if array should be protected against modification, defaults to `false`.
 * @param dimensionSeparator if specified, defines an alternate string separator placed between the dimension chunks.
 */
async function create({ shape, chunks = true, dtype = "<i4", compressor = null, fillValue = null, order = "C", store: storeArgument, overwrite = false, path, chunkStore, filters, cacheMetadata = true, cacheAttrs = true, readOnly = false, dimensionSeparator }) {
    const store = normalizeStoreArgument(storeArgument);
    await initArray(store, shape, chunks, dtype, path, compressor, fillValue, order, overwrite, chunkStore, filters, dimensionSeparator);
    const z = await ZarrArray.create(store, path, readOnly, chunkStore, cacheMetadata, cacheAttrs);
    return z;
}
/**
 * Create an empty array.
 */
async function empty(shape, opts = {}) {
    opts.fillValue = null;
    return create({ shape, ...opts });
}
/**
 * Create an array, with zero being used as the default value for
 * uninitialized portions of the array.
 */
async function zeros(shape, opts = {}) {
    opts.fillValue = 0;
    return create({ shape, ...opts });
}
/**
 * Create an array, with one being used as the default value for
 * uninitialized portions of the array.
 */
async function ones(shape, opts = {}) {
    opts.fillValue = 1;
    return create({ shape, ...opts });
}
/**
 * Create an array, with `fill_value` being used as the default value for
 * uninitialized portions of the array
 */
async function full(shape, fillValue, opts = {}) {
    opts.fillValue = fillValue;
    return create({ shape, ...opts });
}
async function array(data, opts = {}) {
    // TODO: infer chunks?
    let shape = null;
    if (data instanceof NestedArray) {
        shape = data.shape;
        opts.dtype = opts.dtype === undefined ? data.dtype : opts.dtype;
    }
    else {
        shape = data.byteLength;
        // TODO: infer datatype
    }
    // TODO: support TypedArray
    const wasReadOnly = opts.readOnly === undefined ? false : opts.readOnly;
    opts.readOnly = false;
    const z = await create({ shape, ...opts });
    await z.set(null, data);
    z.readOnly = wasReadOnly;
    return z;
}
async function openArray({ ipfsElements, cid, shape, mode = "a", chunks = true, dtype = "<i4", compressor = null, fillValue = null, order = "C", store: storeArgument, overwrite = false, path = null, chunkStore, filters, cacheMetadata = true, cacheAttrs = true, dimensionSeparator, } = {}) {
    const store = normalizeStoreArgument(storeArgument, cid, ipfsElements);
    if (chunkStore === undefined) {
        chunkStore = normalizeStoreArgument(store);
    }
    if (path === null) {
        path = "";
    }
    if (mode === "r" || mode === "r+") {
        if (!(await containsArray(store, path))) {
            if (await containsGroup(store, path)) {
                throw new ContainsGroupError(path);
            }
            throw new ArrayNotFoundError(path);
        }
    }
    else if (mode === "w") {
        if (shape === undefined) {
            throw new ValueError("Shape can not be undefined when creating a new array");
        }
        await initArray(store, shape, chunks, dtype, path, compressor, fillValue, order, overwrite, chunkStore, filters, dimensionSeparator);
    }
    else if (mode === "a") {
        if (!(await containsArray(store, path))) {
            if (await containsGroup(store, path)) {
                throw new ContainsGroupError(path);
            }
            if (shape === undefined) {
                throw new ValueError("Shape can not be undefined when creating a new array");
            }
            await initArray(store, shape, chunks, dtype, path, compressor, fillValue, order, overwrite, chunkStore, filters, dimensionSeparator);
        }
    }
    else if (mode === "w-" || mode === "x") {
        if (await containsArray(store, path)) {
            throw new ContainsArrayError(path);
        }
        else if (await containsGroup(store, path)) {
            throw new ContainsGroupError(path);
        }
        else {
            if (shape === undefined) {
                throw new ValueError("Shape can not be undefined when creating a new array");
            }
            await initArray(store, shape, chunks, dtype, path, compressor, fillValue, order, overwrite, chunkStore, filters, dimensionSeparator);
        }
    }
    else {
        throw new ValueError(`Invalid mode argument: ${mode}`);
    }
    const readOnly = mode === "r";
    return ZarrArray.create(store, path, readOnly, chunkStore, cacheMetadata, cacheAttrs);
}
function normalizeStoreArgument(store, cid, ipfsElements) {
    if (store === undefined) {
        return new MemoryStore();
    }
    else if (store === "ipfs") {
        if (!cid) {
            throw new Error("CID is required for IPFS store");
        }
        if (!ipfsElements) {
            throw new Error("IPFS Elements are required for IPFS store");
        }
        return new IPFSStore(cid, ipfsElements);
    }
    else if (typeof store === "string") {
        return new HTTPStore(store);
    }
    return store;
}

class Group {
    /**
     * Group name following h5py convention.
     */
    get name() {
        if (this.path.length > 0) {
            if (this.path[0] !== "/") {
                return "/" + this.path;
            }
            return this.path;
        }
        return "/";
    }
    /**
     * Final component of name.
     */
    get basename() {
        const parts = this.name.split("/");
        return parts[parts.length - 1];
    }
    /**
     * A `Store` providing the underlying storage for array chunks.
     */
    get chunkStore() {
        if (this._chunkStore) {
            return this._chunkStore;
        }
        return this.store;
    }
    static async create(store, path = null, readOnly = false, chunkStore = null, cacheAttrs = true) {
        const metadata = await this.loadMetadataForConstructor(store, path);
        return new Group(store, path, metadata, readOnly, chunkStore, cacheAttrs);
    }
    static async loadMetadataForConstructor(store, path) {
        path = normalizeStoragePath(path);
        const keyPrefix = pathToPrefix(path);
        try {
            const metaStoreValue = await store.getItem(keyPrefix + GROUP_META_KEY);
            return parseMetadata(metaStoreValue);
        }
        catch (error) {
            if (await containsArray(store, path)) {
                throw new ContainsArrayError(path);
            }
            throw new GroupNotFoundError(path);
        }
    }
    constructor(store, path = null, metadata, readOnly = false, chunkStore = null, cacheAttrs = true) {
        this.store = store;
        this._chunkStore = chunkStore;
        this.path = normalizeStoragePath(path);
        this.keyPrefix = pathToPrefix(this.path);
        this.readOnly = readOnly;
        this.meta = metadata;
        // Initialize attributes
        const attrKey = this.keyPrefix + ATTRS_META_KEY;
        this.attrs = new Attributes(this.store, attrKey, this.readOnly, cacheAttrs);
    }
    itemPath(item) {
        const absolute = typeof item === "string" && item.length > 0 && item[0] === '/';
        const path = normalizeStoragePath(item);
        // Absolute path
        if (!absolute && this.path.length > 0) {
            return this.keyPrefix + path;
        }
        return path;
    }
    /**
     * Create a sub-group.
     */
    async createGroup(name, overwrite = false) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        const path = this.itemPath(name);
        await initGroup(this.store, path, this._chunkStore, overwrite);
        return Group.create(this.store, path, this.readOnly, this._chunkStore, this.attrs.cache);
    }
    /**
     * Obtain a sub-group, creating one if it doesn't exist.
     */
    async requireGroup(name, overwrite = false) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        const path = this.itemPath(name);
        if (!await containsGroup(this.store, path)) {
            await initGroup(this.store, path, this._chunkStore, overwrite);
        }
        return Group.create(this.store, path, this.readOnly, this._chunkStore, this.attrs.cache);
    }
    getOptsForArrayCreation(name, opts = {}) {
        const path = this.itemPath(name);
        opts.path = path;
        if (opts.cacheAttrs === undefined) {
            opts.cacheAttrs = this.attrs.cache;
        }
        opts.store = this.store;
        opts.chunkStore = this.chunkStore;
        return opts;
    }
    /**
     * Creates an array
     */
    array(name, data, opts, overwrite) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        opts = this.getOptsForArrayCreation(name, opts);
        opts.overwrite = overwrite === undefined ? opts.overwrite : overwrite;
        return array(data, opts);
    }
    empty(name, shape, opts = {}) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        opts = this.getOptsForArrayCreation(name, opts);
        return empty(shape, opts);
    }
    zeros(name, shape, opts = {}) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        opts = this.getOptsForArrayCreation(name, opts);
        return zeros(shape, opts);
    }
    ones(name, shape, opts = {}) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        opts = this.getOptsForArrayCreation(name, opts);
        return ones(shape, opts);
    }
    full(name, shape, fillValue, opts = {}) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        opts = this.getOptsForArrayCreation(name, opts);
        return full(shape, fillValue, opts);
    }
    createDataset(name, shape, data, opts) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        opts = this.getOptsForArrayCreation(name, opts);
        let z;
        if (data === undefined) {
            if (shape === undefined) {
                throw new ValueError("Shape must be set if no data is passed to CreateDataset");
            }
            z = create({ shape, ...opts });
        }
        else {
            z = array(data, opts);
        }
        return z;
    }
    async getItem(item) {
        const path = this.itemPath(item);
        if (await containsArray(this.store, path)) {
            return ZarrArray.create(this.store, path, this.readOnly, this.chunkStore, undefined, this.attrs.cache);
        }
        else if (await containsGroup(this.store, path)) {
            return Group.create(this.store, path, this.readOnly, this._chunkStore, this.attrs.cache);
        }
        throw new KeyError(item);
    }
    async setItem(item, value) {
        await this.array(item, value, {}, true);
        return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async deleteItem(_item) {
        if (this.readOnly) {
            throw new PermissionError("group is read only");
        }
        throw new Error("Method not implemented.");
    }
    async containsItem(item) {
        const path = this.itemPath(item);
        return await containsArray(this.store, path) || containsGroup(this.store, path);
    }
    proxy() {
        return createProxy(this);
    }
}
/**
 * Create a group.
 * @param store Store or path to directory in file system.
 * @param path Group path within store.
 * @param chunkStore Separate storage for chunks. If not provided, `store` will be used for storage of both chunks and metadata.
 * @param overwrite If `true`, delete any pre-existing data in `store` at `path` before creating the group.
 * @param cacheAttrs If `true` (default), user attributes will be cached for attribute read operations.
 *   If `false`, user attributes are reloaded from the store prior to all attribute read operations.
 */
async function group(store, path = null, chunkStore, overwrite = false, cacheAttrs = true) {
    store = normalizeStoreArgument(store);
    path = normalizeStoragePath(path);
    if (overwrite || await containsGroup(store)) {
        await initGroup(store, path, chunkStore, overwrite);
    }
    return Group.create(store, path, false, chunkStore, cacheAttrs);
}
/**
 * Open a group using file-mode-like semantics.
 * @param store Store or path to directory in file system or name of zip file.
 * @param path Group path within store.
 * @param mode Persistence mode, see `PersistenceMode` type.
 * @param chunkStore Store or path to directory in file system or name of zip file.
 * @param cacheAttrs If `true` (default), user attributes will be cached for attribute read operations
 *   If False, user attributes are reloaded from the store prior to all attribute read operations.
 * @param ipfsElements IPFS elements which will be used to fetch and store data on the IPFS network
 * @param cid IPFS CID (content identifier) of the zarr file (if it is stored on the IPFS network)
 */
async function openGroup(store, path = null, mode = "a", chunkStore, cacheAttrs = true, ipfsElements, cid) {
    store = normalizeStoreArgument(store, cid, ipfsElements);
    if (chunkStore !== undefined) {
        chunkStore = normalizeStoreArgument(store);
    }
    path = normalizeStoragePath(path);
    if (mode === "r" || mode === "r+") {
        if (!await containsGroup(store, path)) {
            if (await containsArray(store, path)) {
                throw new ContainsArrayError(path);
            }
            throw new GroupNotFoundError(path);
        }
    }
    else if (mode === "w") {
        await initGroup(store, path, chunkStore, true);
    }
    else if (mode === "a") {
        if (!await containsGroup(store, path)) {
            if (await containsArray(store, path)) {
                throw new ContainsArrayError(path);
            }
            await initGroup(store, path, chunkStore);
        }
    }
    else if (mode === "w-" || mode === "x") {
        if (await containsArray(store, path)) {
            throw new ContainsArrayError(path);
        }
        else if (await containsGroup(store, path)) {
            throw new ContainsGroupError(path);
        }
        else {
            await initGroup(store, path, chunkStore);
        }
    }
    else {
        throw new ValueError(`Invalid mode argument: ${mode}`);
    }
    const readOnly = mode === "r";
    return Group.create(store, path, readOnly, chunkStore, cacheAttrs);
}

class ObjectStore {
    constructor() {
        this.object = {};
    }
    getItem(item) {
        if (!Object.prototype.hasOwnProperty.call(this.object, item)) {
            throw new KeyError(item);
        }
        return this.object[item];
    }
    setItem(item, value) {
        this.object[item] = value;
        return true;
    }
    deleteItem(item) {
        return delete this.object[item];
    }
    containsItem(item) {
        return Object.prototype.hasOwnProperty.call(this.object, item);
    }
    proxy() {
        return createProxy(this);
    }
    keys() {
        return Object.getOwnPropertyNames(this.object);
    }
}

addCodec(Zlib$1.codecId, () => Zlib$1);
addCodec(GZip$1.codecId, () => GZip$1);
addCodec(Blosc$1.codecId, () => Blosc$1);

exports.ArrayNotFoundError = ArrayNotFoundError;
exports.BoundsCheckError = BoundsCheckError;
exports.ContainsArrayError = ContainsArrayError;
exports.ContainsGroupError = ContainsGroupError;
exports.Group = Group;
exports.GroupNotFoundError = GroupNotFoundError;
exports.HTTPError = HTTPError;
exports.HTTPStore = HTTPStore;
exports.IPFSStore = IPFSStore;
exports.InvalidSliceError = InvalidSliceError;
exports.KeyError = KeyError;
exports.MemoryStore = MemoryStore;
exports.NegativeStepError = NegativeStepError;
exports.NestedArray = NestedArray;
exports.ObjectStore = ObjectStore;
exports.PathNotFoundError = PathNotFoundError;
exports.PermissionError = PermissionError;
exports.TooManyIndicesError = TooManyIndicesError;
exports.ValueError = ValueError;
exports.ZarrArray = ZarrArray;
exports.addCodec = addCodec;
exports.array = array;
exports.blake3 = blake3;
exports.create = create;
exports.createProxy = createProxy;
exports.empty = empty;
exports.extractBits = extractBits;
exports.full = full;
exports.getCodec = getCodec;
exports.getTypedArrayCtr = getTypedArrayCtr;
exports.getTypedArrayDtypeString = getTypedArrayDtypeString;
exports.group = group;
exports.isKeyError = isKeyError;
exports.normalizeStoreArgument = normalizeStoreArgument;
exports.ones = ones;
exports.openArray = openArray;
exports.openGroup = openGroup;
exports.rangeTypedArray = rangeTypedArray;
exports.slice = slice$1;
exports.sliceIndices = sliceIndices;
exports.zeros = zeros;
//# sourceMappingURL=zarr.cjs.map
