const sodium = require('libsodium-wrappers');

// Initialize sodium
const initSodium = async () => {
  await sodium.ready;
  return sodium;
};

// Generate keypair for new user
const generateKeyPair = async () => {
  await sodium.ready;
  const keypair = sodium.crypto_box_keypair();
  return {
    publicKey:  Buffer.from(keypair.publicKey).toString('base64'),
    privateKey: Buffer.from(keypair.privateKey).toString('base64'),
  };
};

// Encrypt message with recipient's public key
const encryptMessage = async (message, recipientPublicKeyB64) => {
  await sodium.ready;

  const messageBytes    = sodium.from_string(message);
  const recipientPubKey = sodium.from_base64(recipientPublicKeyB64);

  // Sealed box — only recipient can decrypt with their private key
  const encrypted = sodium.crypto_box_seal(messageBytes, recipientPubKey);

  return Buffer.from(encrypted).toString('base64');
};

// Decrypt message with recipient's private key + public key
const decryptMessage = async (encryptedB64, recipientPublicKeyB64, recipientPrivateKeyB64) => {
  await sodium.ready;

  const encrypted  = sodium.from_base64(encryptedB64);
  const publicKey  = sodium.from_base64(recipientPublicKeyB64);
  const privateKey = sodium.from_base64(recipientPrivateKeyB64);

  const decrypted = sodium.crypto_box_seal_open(encrypted, publicKey, privateKey);
  if (!decrypted) throw new Error('Decryption failed — wrong key or tampered message');

  return sodium.to_string(decrypted);
};

// Encrypt with symmetric key (for drafts stored server-side)
const encryptSymmetric = async (message, keyB64) => {
  await sodium.ready;

  const key   = sodium.from_base64(keyB64);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const msg   = sodium.from_string(message);

  const encrypted = sodium.crypto_secretbox_easy(msg, nonce, key);

  return {
    ciphertext: Buffer.from(encrypted).toString('base64'),
    nonce:      Buffer.from(nonce).toString('base64'),
  };
};

// Decrypt symmetric
const decryptSymmetric = async (ciphertextB64, nonceB64, keyB64) => {
  await sodium.ready;

  const ciphertext = sodium.from_base64(ciphertextB64);
  const nonce      = sodium.from_base64(nonceB64);
  const key        = sodium.from_base64(keyB64);

  const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  if (!decrypted) throw new Error('Symmetric decryption failed');

  return sodium.to_string(decrypted);
};

// Generate random symmetric key
const generateSymmetricKey = async () => {
  await sodium.ready;
  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  return Buffer.from(key).toString('base64');
};

module.exports = {
  initSodium,
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  encryptSymmetric,
  decryptSymmetric,
  generateSymmetricKey,
};