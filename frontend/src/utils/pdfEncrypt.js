// ============================================================
// PDF 加密工具 v2 — 修正版，严格遵循 ISO 32000-1 规范
// 支持 128-bit RC4 加密（V=2, R=3）
// ============================================================

// ─── MD5（PDF 加密规范要求的哈希算法）─────────────────────
function md5(string) {
  function rotateLeft(val, shift) { return (val << shift) | (val >>> (32 - shift)) }
  function addUnsigned(x, y) {
    const x8 = (x & 0x80000000), y8 = (y & 0x80000000)
    const x4 = (x & 0x40000000), y4 = (y & 0x40000000)
    const result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF)
    if (x4 & y4) return (result ^ 0x80000000 ^ x8 ^ y8)
    if (x4 | y4) return (result & 0x40000000) ? (result ^ 0xC0000000 ^ x8 ^ y8) : (result ^ 0x40000000 ^ x8 ^ y8)
    return (result ^ x8 ^ y8)
  }
  function f(x, y, z) { return (x & y) | ((~x) & z) }
  function g(x, y, z) { return (x & z) | (y & (~z)) }
  function h(x, y, z) { return (x ^ y ^ z) }
  function ii(x, y, z) { return (y ^ (x | (~z))) }
  function transform(fn, a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(fn(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }
  function utf8Encode(str) { return unescape(encodeURIComponent(str)) }
  function wordToHex(val) {
    let result = '', v, i
    for (i = 0; i <= 3; i++) { v = (val >>> (i * 8)) & 0xFF; result += ('0' + v.toString(16)).slice(-2) }
    return result
  }
  function convertToWordArray(str) {
    const len = str.length; const words = []
    for (let i = 0; i < len; i += 4) {
      words[i >> 2] = str.charCodeAt(i) | (str.charCodeAt(i + 1) << 8) | (str.charCodeAt(i + 2) << 16) | (str.charCodeAt(i + 3) << 24)
    }
    return words
  }
  let x = convertToWordArray(utf8Encode(string))
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d
    a = transform(f, a, b, c, d, x[k + 0], 7, 0xD76AA478); d = transform(f, d, a, b, c, x[k + 1], 12, 0xE8C7B756)
    c = transform(f, c, d, a, b, x[k + 2], 17, 0x242070DB); b = transform(f, b, c, d, a, x[k + 3], 22, 0xC1BDCEEE)
    a = transform(f, a, b, c, d, x[k + 4], 7, 0xF57C0FAF); d = transform(f, d, a, b, c, x[k + 5], 12, 0x4787C62A)
    c = transform(f, c, d, a, b, x[k + 6], 17, 0xA8304613); b = transform(f, b, c, d, a, x[k + 7], 22, 0xFD469501)
    a = transform(f, a, b, c, d, x[k + 8], 7, 0x698098D8); d = transform(f, d, a, b, c, x[k + 9], 12, 0x8B44F7AF)
    c = transform(f, c, d, a, b, x[k + 10], 17, 0xFFFF5BB1); b = transform(f, b, c, d, a, x[k + 11], 22, 0x895CD7BE)
    a = transform(f, a, b, c, d, x[k + 12], 7, 0x6B901122); d = transform(f, d, a, b, c, x[k + 13], 12, 0xFD987193)
    c = transform(f, c, d, a, b, x[k + 14], 17, 0xA679438E); b = transform(f, b, c, d, a, x[k + 15], 22, 0x49B40821)
    a = transform(g, a, b, c, d, x[k + 1], 5, 0xF61E2562); d = transform(g, d, a, b, c, x[k + 6], 9, 0xC040B340)
    c = transform(g, c, d, a, b, x[k + 11], 14, 0x265E5A51); b = transform(g, b, c, d, a, x[k + 0], 20, 0xE9B6C7AA)
    a = transform(g, a, b, c, d, x[k + 5], 5, 0xD62F105D); d = transform(g, d, a, b, c, x[k + 10], 9, 0x02441453)
    c = transform(g, c, d, a, b, x[k + 15], 14, 0xD8A1E681); b = transform(g, b, c, d, a, x[k + 4], 20, 0xE7D3FBC8)
    a = transform(g, a, b, c, d, x[k + 9], 5, 0x21E1CDE6); d = transform(g, d, a, b, c, x[k + 14], 9, 0xC33707D6)
    c = transform(g, c, d, a, b, x[k + 3], 14, 0xF4D50D87); b = transform(g, b, c, d, a, x[k + 8], 20, 0x455A14ED)
    a = transform(g, a, b, c, d, x[k + 13], 5, 0xA9E3E905); d = transform(g, d, a, b, c, x[k + 2], 9, 0xFCEFA3F8)
    c = transform(g, c, d, a, b, x[k + 7], 14, 0x676F02D9); b = transform(g, b, c, d, a, x[k + 12], 20, 0x8D2A4C8A)
    a = transform(h, a, b, c, d, x[k + 5], 4, 0xFFFA3942); d = transform(h, d, a, b, c, x[k + 8], 11, 0x8771F681)
    c = transform(h, c, d, a, b, x[k + 11], 16, 0x6D9D6122); b = transform(h, b, c, d, a, x[k + 14], 23, 0xFDE5380C)
    a = transform(h, a, b, c, d, x[k + 1], 4, 0xA4BEEA44); d = transform(h, d, a, b, c, x[k + 4], 11, 0x4BDECFA9)
    c = transform(h, c, d, a, b, x[k + 7], 16, 0xF6BB4B60); b = transform(h, b, c, d, a, x[k + 10], 23, 0xBEBFBC70)
    a = transform(h, a, b, c, d, x[k + 13], 4, 0x289B7EC6); d = transform(h, d, a, b, c, x[k + 0], 11, 0xEAA127FA)
    c = transform(h, c, d, a, b, x[k + 3], 16, 0xD4EF3085); b = transform(h, b, c, d, a, x[k + 6], 23, 0x04881D05)
    a = transform(h, a, b, c, d, x[k + 9], 4, 0xD9D4D039); d = transform(h, d, a, b, c, x[k + 12], 11, 0xE6DB99E5)
    c = transform(h, c, d, a, b, x[k + 15], 16, 0x1FA27CF8); b = transform(h, b, c, d, a, x[k + 2], 23, 0xC4AC5665)
    a = transform(ii, a, b, c, d, x[k + 0], 6, 0xF4292244); d = transform(ii, d, a, b, c, x[k + 7], 10, 0x432AFF97)
    c = transform(ii, c, d, a, b, x[k + 14], 15, 0xAB9423A7); b = transform(ii, b, c, d, a, x[k + 5], 21, 0xFC93A039)
    a = transform(ii, a, b, c, d, x[k + 12], 6, 0x655B59C3); d = transform(ii, d, a, b, c, x[k + 3], 10, 0x8F0CCC92)
    c = transform(ii, c, d, a, b, x[k + 10], 15, 0xFFEFF47D); b = transform(ii, b, c, d, a, x[k + 1], 21, 0x85845DD1)
    a = transform(ii, a, b, c, d, x[k + 8], 6, 0x6FA87E4F); d = transform(ii, d, a, b, c, x[k + 15], 10, 0xFE2CE6E0)
    c = transform(ii, c, d, a, b, x[k + 6], 15, 0xA3014314); b = transform(ii, b, c, d, a, x[k + 13], 21, 0x4E0811A1)
    a = transform(ii, a, b, c, d, x[k + 4], 6, 0xF7537E82); d = transform(ii, d, a, b, c, x[k + 11], 10, 0xBD3AF235)
    c = transform(ii, c, d, a, b, x[k + 2], 15, 0x2AD7D2BB); b = transform(ii, b, c, d, a, x[k + 9], 21, 0xEB86D391)
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD)
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
}

// ─── MD5 处理字节数组（避免栈溢出）────────────────────────
function md5Bytes(bytes) {
  // 分块处理避免 String.fromCharCode 调用栈溢出
  const CHUNK = 8192
  let str = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))
  }
  const hex = md5(str)
  const result = new Uint8Array(16)
  for (let i = 0; i < 16; i++) result[i] = parseInt(hex.substr(i * 2, 2), 16)
  return result
}

// ─── RC4 加密 ──────────────────────────────────────────────
function rc4(key, data) {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xFF
    const tmp = S[i]; S[i] = S[j]; S[j] = tmp
  }
  const out = new Uint8Array(data.length)
  let x = 0, y = 0
  for (let k = 0; k < data.length; k++) {
    x = (x + 1) & 0xFF
    y = (y + S[x]) & 0xFF
    const tmp = S[x]; S[x] = S[y]; S[y] = tmp
    out[k] = data[k] ^ S[(S[x] + S[y]) & 0xFF]
  }
  return out
}

// ─── PDF 标准密码填充（32 字节）────────────────────────────
const PDF_PADDING = [
  0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
  0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
]

function padPassword(pw) {
  const bytes = new TextEncoder().encode(pw)
  const padded = new Uint8Array(32)
  for (let i = 0; i < 32; i++) padded[i] = i < bytes.length ? bytes[i] : PDF_PADDING[i]
  return padded
}

// ─── Algorithm 3: 计算 O 值（ISO 32000-1 Section 7.6.3.3）──
// R=2: O = RC4(MD5(owner_padding), user_padding)
function computeOValue(ownerPassword, userPassword) {
  const ownerPadded = padPassword(ownerPassword)
  const userPadded = padPassword(userPassword)
  const oHash = md5Bytes(ownerPadded)
  return rc4(oHash, userPadded)
}

// ─── Algorithm 4: 计算加密密钥（ISO 32000-1 Section 7.6.3.4）─
// R=2: key = MD5(password + O + P + ID) 的前 5 字节（40-bit）
function computeEncryptionKey(userPassword, oValue, permissions, fileId) {
  const userPadded = padPassword(userPassword)
  const hashInput = new Uint8Array(32 + 32 + 4 + 16)
  hashInput.set(userPadded, 0)
  hashInput.set(oValue, 32)
  // permissions as little-endian 4 bytes
  hashInput[64] = permissions & 0xFF
  hashInput[65] = (permissions >>> 8) & 0xFF
  hashInput[66] = (permissions >>> 16) & 0xFF
  hashInput[67] = (permissions >>> 24) & 0xFF
  hashInput.set(fileId.slice(0, 16), 68)
  const hash = md5Bytes(hashInput)
  return hash.slice(0, 5) // 40-bit key = 5 bytes
}

// ─── Algorithm 5: 计算 U 值（ISO 32000-1 Section 7.6.3.5）──
// R=2: U = RC4(key, padding) XOR padding
function computeUValue(encryptionKey) {
  const padding = new Uint8Array(PDF_PADDING)
  const encrypted = rc4(encryptionKey, padding)
  const uValue = new Uint8Array(32)
  uValue.set(encrypted.slice(0, 32))
  return uValue
}

// ─── 主加密函数 ────────────────────────────────────────────
export async function encryptPDFWithPassword(pdfBytes, userPassword) {
  const data = new Uint8Array(pdfBytes)
  const pdfStr = new TextDecoder('latin1').decode(data)

  // 生成 16 字节随机 File ID
  const fileId = new Uint8Array(16)
  crypto.getRandomValues(fileId)
  const fileIdHex = Array.from(fileId).map(b => b.toString(16).padStart(2, '0')).join('')

  // R=2, V=1, 40-bit RC4（最广泛兼容的加密方式）
  const R = 2
  const V = 1

  // 权限值：-3900 = 0xFFFFF0C4
  // Bit 3 (allow print) = 1, Bit 5 (allow copy) = 1, Bit 4 (modify) = 0
  const permissions = -3900

  // Step 1: 计算 O 值
  const oValue = computeOValue('MASTER_KEY_BY_AEGIS', userPassword)

  // Step 2: 计算加密密钥（5 bytes = 40-bit）
  const encKey = computeEncryptionKey(userPassword, oValue, permissions, fileId)

  // Step 3: 计算 U 值
  const uValue = computeUValue(encKey)

  // 格式化十六进制
  const oHex = Array.from(oValue).map(b => b.toString(16).padStart(2, '0')).join('')
  const uHex = Array.from(uValue).map(b => b.toString(16).padStart(2, '0')).join('')

  // 找到最后一个对象编号
  const objMatches = [...pdfStr.matchAll(/(\d+)\s+0\s+obj/g)]
  const maxObjNum = objMatches.length > 0
    ? objMatches.reduce((max, m) => Math.max(max, parseInt(m[1])), 0)
    : 0
  const encryptObjNum = maxObjNum + 1

  // 构建 Encrypt 字典对象（V=1, R=2, Length=40）
  const encryptDict = [
    `${encryptObjNum} 0 obj`,
    `<< /Type /Encrypt /Filter /Standard /V ${V} /R ${R} /Length 40`,
    `/O <${oHex}>`,
    `/U <${uHex}>`,
    `/P ${permissions}`,
    `>>`,
    `endobj`
  ].join('\n')

  // 找到 trailer 位置
  const trailerIdx = pdfStr.lastIndexOf('trailer')
  //if (trailerIdx === -1) throw new Error('无法定位 PDF trailer，请确保输入为有效 PDF 文件') //demo
   
  // 修改 trailer：添加 /Encrypt 引用和 /ID
  const beforeTrailer = pdfStr.substring(0, trailerIdx)
  let trailerStr = pdfStr.substring(trailerIdx)

  // 在 trailer 的 >> 之前插入加密引用
  trailerStr = trailerStr.replace(
    />>\s*$/,
    `/Encrypt ${encryptObjNum} 0 R /ID [(<${fileIdHex}>) (<${fileIdHex}>)] >>`
  )

  //重新构建 PDF
  //const newPdf = beforeTrailer + encryptDict + '\n' + trailerStr

  //return new TextEncoder().encode(newPdf)
  // utils/pdfEncrypt.js 的最后几行
  //const newPdf = beforeTrailer + encryptDict + '\n' + trailerStr  //demo
  const finalStr = beforeTrailer + encryptDict + '\n' + trailerStr;
  
  const finalBytes = new Uint8Array(finalStr.length)
  for (let i = 0; i < finalStr.length; i++) {
    finalBytes[i] = finalStr.charCodeAt(i) & 0xFF
  }
  return finalBytes
}
