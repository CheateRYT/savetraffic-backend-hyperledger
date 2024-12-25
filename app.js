const express = require("express");
const fs = require("fs");
const grpc = require("@grpc/grpc-js");
const { connect, signers } = require("@hyperledger/fabric-gateway");
const crypto = require("crypto");
const hash = require("crypto").createHash;
const utf8Decoder = new TextDecoder("utf-8");
const cors = require("cors");
const app = express();
const port = 3000;
const peerEndpoint = "localhost:7051";
const peerHostOverride = "peer0.org1.example.com";
const tlsCertPath =
  "/home/user/project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem";

async function newGrpcConnection() {
  const tlsRootCert = await fs.promises.readFile(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(peerEndpoint, tlsCredentials, {
    "grpc.ssl_target_name_override": peerHostOverride,
  });
}

async function newIdentity(user) {
  const certPath = `/home/user/project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/${user}/msp/signcerts/${user}-cert.pem`;
  const credentials = await fs.promises.readFile(certPath);
  return { mspId: "Org1MSP", credentials };
}

async function newSigner(user) {
  const keyPath = `/home/user/project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/${user}/msp/keystore/priv_sk`;
  const privateKeyPem = await fs.promises.readFile(keyPath);
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

async function main() {
  app.use(express.json());
  app.use(
    cors({
      origin: "http://localhost:5173",
    })
  );

  // Простой маршрут
  app.get("/", async (req, res) => {
    res.send(await contract.submitTransaction("InitLedger"));
  });

  // Функция для отправки транзакции
  async function sendTransaction(user, transactionName, ...args) {
    const client = await newGrpcConnection();
    const gateway = connect({
      client,
      identity: await newIdentity(user),
      signer: await newSigner(user),
      hash: hash.sha256,
    });
    const network = gateway.getNetwork("mychannel");
    const contract = network.getContract("saveTrafficSystem");
    return await contract.submitTransaction(transactionName, ...args);
  }

  // Маршрут для добавления водительского удостоверения
  app.post("/api/drivers/:driverId/license", async (req, res) => {
    const { driverId } = req.params;
    const { licenseNumber, expiryDate, category, user } = req.body; // Добавлено поле user
    try {
      const result = await sendTransaction(
        user,
        "AddDrivingLicense",
        driverId,
        licenseNumber,
        expiryDate,
        category
      );
      res.json({
        message: "Водительское удостоверение добавлено!",
        result: utf8Decoder.decode(result),
      });
    } catch (error) {
      console.error(
        "Ошибка при добавлении водительского удостоверения:",
        error
      );
      res
        .status(500)
        .json({ error: "Ошибка при добавлении водительского удостоверения" });
    }
  });

  // Маршрут для регистрации транспортного средства

  app.post("/api/drivers/:driverId/vehicle", async (req, res) => {
    const { driverId } = req.params;
    const { vehicleCategory, user } = req.body; // Добавлено поле user
    try {
      const result = await sendTransaction(
        user,
        "RegisterVehicle",
        driverId,
        vehicleCategory
      );
      res.json({
        message: "Транспортное средство зарегистрировано!",
        result: utf8Decoder.decode(result),
      });
    } catch (error) {
      console.error("Ошибка при регистрации транспортного средства:", error);
      res
        .status(500)
        .json({ error: "Ошибка при регистрации транспортного средства" });
    }
  });

  // Маршрут для продления водительского удостоверения
  app.post("/api/drivers/:driverId/license/renew", async (req, res) => {
    const { driverId } = req.params;
    const { user } = req.body; // Добавлено поле user
    try {
      const result = await sendTransaction(
        user,
        "RenewDrivingLicense",
        driverId
      );
      res.json({
        message: "Срок действия водительского удостоверения продлен!",
        result: utf8Decoder.decode(result),
      });
    } catch (error) {
      console.error("Ошибка при продлении водительского удостоверения:", error);
      res
        .status(500)
        .json({ error: "Ошибка при продлении водительского удостоверения" });
    }
  });

  // Маршрут для оплаты штрафа
  app.post("/api/drivers/:driverId/fine/pay", async (req, res) => {
    const { driverId } = req.params;
    const { user } = req.body; // Добавлено поле user
    try {
      const result = await sendTransaction(user, "PayFine", driverId);
      res.json({
        message: "Штраф оплачен!",
        result: utf8Decoder.decode(result),
      });
    } catch (error) {
      console.error("Ошибка при оплате штрафа:", error);
      res.status(500).json({ error: "Ошибка при оплате штрафа" });
    }
  });

  // Маршрут для выписывания штрафа
  app.post("/api/drivers/:driverId/fine/issue", async (req, res) => {
    const { driverId } = req.params;
    const { user } = req.body; // Добавлено поле user
    try {
      const result = await sendTransaction(user, "IssueFine", driverId);
      res.json({
        message: "Штраф выписан!",
        result: utf8Decoder.decode(result),
      });
    } catch (error) {
      console.error("Ошибка при выписывании штрафа:", error);
      res.status(500).json({ error: "Ошибка при выписывании штрафа" });
    }
  });

  // Маршрут для получения всех водителей
  app.get("/api/drivers", async (req, res) => {
    const { user } = req.query; // Добавлено поле user
    try {
      const client = await newGrpcConnection();
      const gateway = connect({
        client,
        identity: await newIdentity(user),
        signer: await newSigner(user),
        hash: hash.sha256,
      });
      const network = gateway.getNetwork("mychannel");
      const contract = network.getContract("saveTrafficSystem");
      const resultBytes = await contract.evaluateTransaction("GetAllDrivers");
      const resultJson = utf8Decoder.decode(resultBytes);
      const result = JSON.parse(resultJson);
      console.log("*** Result:", result);
      res.json(result);
    } catch (error) {
      console.error(`Ошибка при получении данных: ${error}`);
      res.status(500).json({ error: `Ошибка при получении данных ${error}` });
    }
  });

  // Запуск сервера
  app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
  });
}

// Запуск основного процесса
main().catch(console.error);
