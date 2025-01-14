const express = require("express"); // Импортируем модуль express для создания сервера
const fs = require("fs"); // Импортируем модуль fs для работы с файловой системой
const grpc = require("@grpc/grpc-js"); // Импортируем gRPC для работы с удаленными вызовами процедур
const { connect, signers } = require("@hyperledger/fabric-gateway"); // Импортируем функции для работы с Hyperledger Fabric
const crypto = require("crypto"); // Импортируем модуль crypto для работы с криптографией
const hash = require("crypto").createHash; // Создаем хеш-функцию
const utf8Decoder = new TextDecoder("utf-8"); // Создаем декодер для преобразования данных в UTF-8
const cors = require("cors"); // Импортируем модуль cors для настройки CORS
const app = express(); // Создаем экземпляр приложения Express
const port = 3000; // Устанавливаем порт для сервера
const peerEndpoint = "localhost:7051"; // Указываем адрес пира
const peerHostOverride = "peer0.org1.example.com"; // Переопределяем имя хоста пира для подключения
// Указываем пути к сертификатам и ключам
const tlsCertPath =
  "/home/user/project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem";
const certPath =
  "/home/user/project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem";
const keyPath =
  "/home/user/project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk";

// Функция для создания gRPC подключения
async function newGrpcConnection() {
  const tlsRootCert = await fs.promises.readFile(tlsCertPath); // Читаем корневой сертификат
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert); // Создаем TLS-креденциалы
  return new grpc.Client(peerEndpoint, tlsCredentials, {
    // Создаем новый gRPC клиент
    "grpc.ssl_target_name_override": peerHostOverride, // Переопределяем имя хоста
  });
}

// Основная асинхронная функция
async function main() {
  const client = await newGrpcConnection(); // Создаем gRPC подключение
  const gateway = connect({
    // Подключаемся к сети Hyperledger Fabric
    client,
    identity: await newIdentity(), // Получаем идентичность
    signer: await newSigner(), // Получаем подписчик
    hash: hash.sha256, // Указываем хеш-функцию
  });
  const network = gateway.getNetwork("mychannel"); // Получаем сеть
  const contract = network.getContract("saveTrafficSystem"); // Получаем контракт

  app.use(express.json()); // Подключаем middleware для парсинга JSON
  app.use(
    cors({
      // Настраиваем CORS
      origin: "http://localhost:5173", // Разрешаем доступ с указанного источника
    })
  );

  // Инициализация главной страницы
  app.get("/", async (req, res) => {
    res.send(await contract.submitTransaction("InitLedger")); // Вызываем транзакцию InitLedger и отправляем результат
  });

  // Аутентификация пользователя
  app.post("/api/auth", async (req, res) => {
    const { login, password, key } = req.body; // Извлекаем данные из тела запроса
    try {
      const result = await contract.evaluateTransaction(
        "auth",
        login,
        password,
        key
      ); // Вызываем транзакцию auth
      const authResult = JSON.parse(utf8Decoder.decode(result)); // Декодируем и парсим результат
      if (authResult.auth) {
        // Проверяем, прошла ли аутентификация
        res.json({ message: "Аутентификация успешна!", role: authResult.role }); // Отправляем успешный ответ
      } else {
        res.status(401).json({ error: "Неверные учетные данные" }); // Отправляем ошибку, если аутентификация не удалась
      }
    } catch (error) {
      console.error("Ошибка аутентификации:", error); // Логируем ошибку
      res.status(500).json({ error: "Ошибка аутентификации" }); // Отправляем ошибку
    }
  });

  // Создание нового пользователя
  app.post("/api/users", async (req, res) => {
    const {
      login,
      password,
      key,
      userId,
      balance,
      role,
      fullName,
      yearStartedDriving,
    } = req.body; // Извлекаем данные из тела запроса
    try {
      const result = await contract.submitTransaction(
        "createUser",
        login,
        password,
        key,
        userId,
        balance,
        role,
        fullName,
        yearStartedDriving
      ); // Вызываем транзакцию createUser
      res.status(201).json({
        message: "Пользователь успешно создан!",
        result: utf8Decoder.decode(result),
      }); // Отправляем успешный ответ
    } catch (error) {
      console.error("Ошибка при создании пользователя:", error); // Логируем ошибку
      res.status(500).json({ error: "Ошибка при создании пользователя" }); // Отправляем ошибку
    }
  });

  // Добавление водительского удостоверения
  app.post("/api/drivers/:driverId/license", async (req, res) => {
    const { driverId } = req.params; // Извлекаем driverId из параметров URL
    const { licenseNumber, expiryDate, category } = req.body; // Извлекаем данные из тела запроса
    try {
      const result = await contract.submitTransaction(
        "AddDrivingLicense",
        driverId,
        licenseNumber,
        expiryDate,
        category
      ); // Вызываем транзакцию AddDrivingLicense
      res.status(201).json({
        message: "Водительское удостоверение добавлено!",
        result: utf8Decoder.decode(result),
      }); // Отправляем успешный ответ
    } catch (error) {
      console.error(
        "Ошибка при добавлении водительского удостоверения:",
        error
      ); // Логируем ошибку
      res
        .status(500)
        .json({ error: "Ошибка при добавлении водительского удостоверения" }); // Отправляем ошибку
    }
  });

  // Регистрация транспортного средства
  app.post("/api/drivers/:driverId/vehicle", async (req, res) => {
    const { driverId } = req.params; // Извлекаем driverId из параметров URL
    const { vehicleCategory, marketValue, exploitationPeriod } = req.body; // Извлекаем данные из тела запроса
    try {
      const result = await contract.submitTransaction(
        "RegisterVehicle",
        driverId,
        vehicleCategory,
        marketValue,
        exploitationPeriod
      ); // Вызываем транзакцию RegisterVehicle
      res.status(201).json({
        message: "Транспортное средство зарегистрировано!",
        result: utf8Decoder.decode(result),
      }); // Отправляем успешный ответ
    } catch (error) {
      console.error("Ошибка при регистрации транспортного средства:", error); // Логируем ошибку
      res
        .status(500)
        .json({ error: "Ошибка при регистрации транспортного средства" }); // Отправляем ошибку
    }
  });

  // Продление водительского удостоверения
  app.post("/api/drivers/:driverId/license/renew", async (req, res) => {
    const { driverId } = req.params; // Извлекаем driverId из параметров URL
    try {
      const result = await contract.submitTransaction(
        "RenewDrivingLicense",
        driverId
      ); // Вызываем транзакцию RenewDrivingLicense
      res.json({
        message: "Срок действия водительского удостоверения продлен!",
        result: utf8Decoder.decode(result),
      }); // Отправляем успешный ответ
    } catch (error) {
      console.error("Ошибка при продлении водительского удостоверения:", error); // Логируем ошибку
      res
        .status(500)
        .json({ error: "Ошибка при продлении водительского удостоверения" }); // Отправляем ошибку
    }
  });

  // Оплата штрафа
  app.post("/api/drivers/:driverId/fine/pay", async (req, res) => {
    const { driverId } = req.params; // Извлекаем driverId из параметров URL
    try {
      const result = await contract.submitTransaction("PayFine", driverId); // Вызываем транзакцию PayFine
      res.json({
        message: "Штраф оплачен!",
        result: utf8Decoder.decode(result),
      }); // Отправляем успешный ответ
    } catch (error) {
      console.error("Ошибка при оплате штрафа:", error); // Логируем ошибку
      res.status(500).json({ error: "Ошибка при оплате штрафа" }); // Отправляем ошибку
    }
  });

  // Выписка штрафа
  app.post("/api/drivers/:driverId/fine/issue", async (req, res) => {
    const { driverId } = req.params; // Извлекаем driverId из параметров URL
    try {
      const result = await contract.submitTransaction("IssueFine", driverId); // Вызываем транзакцию IssueFine
      res.json({
        message: "Штраф выписан!",
        result: utf8Decoder.decode(result),
      }); // Отправляем успешный ответ
    } catch (error) {
      console.error("Ошибка при выписывании штрафа:", error); // Логируем ошибку
      res.status(500).json({ error: "Ошибка при выписывании штрафа" }); // Отправляем ошибку
    }
  });

  // Получение всех водителей
  app.get("/api/drivers", async (req, res) => {
    try {
      const resultBytes = await contract.evaluateTransaction("GetAllDrivers"); // Вызываем транзакцию GetAllDrivers
      const resultJson = utf8Decoder.decode(resultBytes); // Декодируем результат
      const result = JSON.parse(resultJson); // Парсим результат в JSON
      res.json(result); // Отправляем результат
    } catch (error) {
      console.error("Ошибка при получении данных:", error); // Логируем ошибку
      res.status(500).json({ error: "Ошибка при получении данных" }); // Отправляем ошибку
    }
  });

  // Запуск сервера
  app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`); // Логируем сообщение о запуске сервера
  });
}

// Функция для получения идентичности
async function newIdentity() {
  const credentials = await fs.promises.readFile(certPath); // Читаем сертификат
  return { mspId: "Org1MSP", credentials }; // Возвращаем объект с идентичностью
}

// Функция для получения подписчика
async function newSigner() {
  const privateKeyPem = await fs.promises.readFile(keyPath); // Читаем приватный ключ
  const privateKey = crypto.createPrivateKey(privateKeyPem); // Создаем объект приватного ключа
  return signers.newPrivateKeySigner(privateKey); // Возвращаем подписчик
}

// Запуск основного процесса
main().catch(console.error); // Запускаем основную функцию и обрабатываем ошибки
