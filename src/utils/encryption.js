const sodium = require('libsodium-wrappers');

const getSodium = async () => {
  await sodium.ready;
  return sodium;
};

const generateKeyPair = async () => {
  const s = await getSodium();
  const keypair = s.crypto_box_keypair();
  return {
    publicKey:  Buffer.from(keypair.publicKey).toString('base64'),
    privateKey: Buffer.from(keypair.privateKey).toString('base64'),
  };
};

const encryptMessage = async (message, recipientPublicKeyB64) => {
  const s = await getSodium();
  const messageBytes = s.from_string(message);

  let recipientPubKey;
  try {
    recipientPubKey = s.from_base64(recipientPublicKeyB64, s.base64_variants.ORIGINAL);
  } catch {
    try {
      recipientPubKey = s.from_base64(recipientPublicKeyB64, s.base64_variants.URLSAFE);
    } catch {
      recipientPubKey = s.from_base64(recipientPublicKeyB64);
    }
  }

  const encrypted = s.crypto_box_seal(messageBytes, recipientPubKey);
  return Buffer.from(encrypted).toString('base64');
};

const decryptMessage = async (encryptedB64, recipientPublicKeyB64, recipientPrivateKeyB64) => {
  const s = await getSodium();

  const encrypted  = s.from_base64(encryptedB64);

  let publicKey;
  try {
    publicKey = s.from_base64(recipientPublicKeyB64, s.base64_variants.ORIGINAL);
  } catch {
    publicKey = s.from_base64(recipientPublicKeyB64);
  }

  let privateKey;
  try {
    privateKey = s.from_base64(recipientPrivateKeyB64, s.base64_variants.ORIGINAL);
  } catch {
    privateKey = s.from_base64(recipientPrivateKeyB64);
  }

  const decrypted = s.crypto_box_seal_open(encrypted, publicKey, privateKey);
  if (!decrypted) throw new Error('Decryption failed');
  return s.to_string(decrypted);
};

const encryptSymmetric = async (message, keyB64) => {
  const s     = await getSodium();
  const key   = s.from_base64(keyB64);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const msg   = s.from_string(message);
  const encrypted = s.crypto_secretbox_easy(msg, nonce, key);
  return {
    ciphertext: Buffer.from(encrypted).toString('base64'),
    nonce:      Buffer.from(nonce).toString('base64'),
  };
};

const decryptSymmetric = async (ciphertextB64, nonceB64, keyB64) => {
  const s          = await getSodium();
  const ciphertext = s.from_base64(ciphertextB64);
  const nonce      = s.from_base64(nonceB64);
  const key        = s.from_base64(keyB64);
  const decrypted  = s.crypto_secretbox_open_easy(ciphertext, nonce, key);
  if (!decrypted) throw new Error('Symmetric decryption failed');
  return s.to_string(decrypted);
};

const generateSymmetricKey = async () => {
  const s   = await getSodium();
  const key = s.randombytes_buf(s.crypto_secretbox_KEYBYTES);
  return Buffer.from(key).toString('base64');
};

module.exports = {
  getSodium,
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  encryptSymmetric,
  decryptSymmetric,
  generateSymmetricKey,
};