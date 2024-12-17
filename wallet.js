const { Wallets } = require("fabric-network");

const connect = () => Wallets.newFileSystemWallet("./data/wallet");
exports.connect = connect;

const convertToX509 = (orgMsp, user) => {
  const x509 = {
    credentials: {
      certificate: user.certificate,
      privateKey: user.key.toBytes(),
    },
    mspId: orgMsp,
    type: "X.509",
  };
  return x509;
};
exports.convertToX509 = convertToX509;
