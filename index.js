const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
const schedule = require("node-schedule");

require("dotenv").config();

const TOKEN = process.env.TOKEN;
const URI = process.env.URI;
const CATS = process.env.CATS_API;

const bot = new TelegramBot(TOKEN, { polling: true });
const client = new MongoClient(URI);
let database = null;

async function main() {
  try {
    await client.connect();
    database = client.db("telegram-bot");

    console.info("DATABASE CONNECTION ESTABLISHED");
    console.info("BOT IS RUNNING");

    bot.onText(/^[^/]*$/, async (msg) => {
      const chat_id = msg.chat.id;
      const username = msg.chat.username;

      const incomingMessage = msg.text;

      const text = await randomText({ type: "frequent" });
      const sticker = await randomSticker({});
      const resplyMessage = text;

      await bot.sendMessage(chat_id, resplyMessage);
      await bot.sendSticker(chat_id, sticker);

      insertMessage({
        from: { chat_id, username },
        to: { chat_id: "BOT", username: "BOT" },
        message: incomingMessage,
        reply: resplyMessage,
        type: "message",
      });
    });

    bot.onText(/\/start/, async (msg) => {
      const chat_id = msg.chat.id;
      const username = msg.chat.username;

      const messages = {
        greeting:
          "Привет, солнышко! Если тебе захочется щипотку любви и тепла, то смело пиши мне! А также периодически я буду писать тебе и попытаюсь сделать счастливее!",
        changedMind: "Супер! Малыш, я рад, что ты передумала!",
        alreadySubscribed:
          "Хорошая моя, ты уже подписалась на рассылку моих любовных сообщений!",
      };

      try {
        const exists = await isUserExists({ chat_id });
        if (!exists) {
          await insertMember({ chat_id, username });
          bot.sendMessage(chat_id, messages.greeting);
          console.log("NEW USER ADDED: " + username);
        } else if (!(await isUserEnabled({ chat_id }))) {
          await updateMember({ chat_id, update: { enabled: true } });
          bot.sendMessage(chat_id, messages.changedMind);
        } else {
          bot.sendMessage(chat_id, messages.alreadySubscribed);
        }

        insertMessage({
          from: { chat_id, username },
          to: { chat_id: "BOT", username: "BOT" },
          message: "/start",
          type: "on-start",
        });
      } catch (e) {
        console.error(e);
        console.warn("ERROR DURING ONSTART BY ", chat_id + " " + username);
      }
    });

    bot.onText(/\/cat/, async (msg) => {
      const chat_id = msg.chat.id;
      const username = msg.chat.username;

      try {
        bot.sendAnimation(chat_id, CATS + Math.random());

        insertMessage({
          to: { chat_id, username },
          from: { chat_id: "BOT", username: "BOT" },
          message: "cat",
          type: "on-cat",
        });
      } catch (e) {
        console.error(e);
        console.warn("ERROR DURING ONCAT BY ", chat_id + " " + username);
      }
    });
    bot.onText(/\/stop/, async (msg) => {
      const chat_id = msg.chat.id;
      const username = msg.chat.username;

      const messages = {
        notExists:
          "Хм, выглядит так, словно мы с тобой еще не знакомы. Попробуй ввести команду /start",
        alreadyUnsubscribed:
          "Зайка, ты уже отписалась от рассылки. Попробуй лучше ввести команду /start",
        unsubscribed:
          "Эххх, а мне так хорошо было с тобой... Возвращайся поскорее",
      };

      try {
        const exists = await isUserExists({ chat_id });
        if (!exists) {
          await insertMember({ chat_id, username });
          bot.sendMessage(chat_id, messages.notExists);
        } else if (await isUserEnabled({ chat_id })) {
          await updateMember({ chat_id, update: { enabled: false } });
          bot.sendMessage(chat_id, messages.unsubscribed);
        } else {
          bot.sendMessage(chat_id, messages.alreadyUnsubscribed);
        }

        insertMessage({
          from: { chat_id, username },
          to: { chat_id: "BOT", username: "BOT" },
          message: "/stop",
          type: "on-stop",
        });
      } catch (e) {
        console.error(e);
        console.warn("ERROR DURING ONSTOP BY ", chat_id + " " + username);
      }
    });

    bot.onText(
      /^(?!.*\/start)(?!.*\/stop)(?!.*\/cat).*\//,
      async (msg, match) => {
        const chat_id = msg.chat.id;
        const username = msg.chat.username;

        bot.sendMessage(chat_id, "Я тебя не понимаю, заюш :-(");
        insertMessage({
          from: { chat_id, username },
          to: { chat_id: "BOT", username: "BOT" },
          message: match?.input || undefined,
          type: "non-supported-command",
        });
      }
    );

    schedule.scheduleJob(
      "0 */2 * * *",
      sendScheduledMessages.bind(this, "frequent")
    ); // every 2 hours
    schedule.scheduleJob(
      "0 6 * * *",
      sendScheduledMessages.bind(this, "morning")
    ); // every day 09:00
    schedule.scheduleJob(
      "30 20 * * *",
      sendScheduledMessages.bind(this, "night")
    ); // every day 23:00
  } catch (e) {
    console.error(e);
    console.info("DATABASE IS NOT CONNECTED");
    console.info("BOT IS NOT RUNNING");
    console.log("- - - - - - - - - - -");
    console.warn("Teminating the process...");

    await bot.sendMessage(64752337, "BOT IS TERMINATED!");
    await client.close();
    process.kill(0);
  }
}

main().catch(console.error);

async function sendScheduledMessages(type) {
  try {
    const members = await getMembers({});

    await Promise.all(
      members.map(async (member) => {
        try {
          const { chat_id, username } = member;

          const text = await randomText({ type });
          const sticker = await randomSticker({});

          await bot.sendMessage(chat_id, text);
          await bot.sendSticker(chat_id, sticker);

          insertMessage({
            to: { chat_id, username },
            from: { chat_id: "BOT", username: "BOT" },
            message: text,
            type,
          });

          console.log(`Sent ${type} message to -> ` + chat_id);
        } catch (e) {
          console.log(e);
          console.warn(
            `ERROR DURING SEND SCHEDULED MESSAGES -> ` + member?.chat_id
          );
        }
      })
    );
  } catch (e) {
    console.log(e);
    console.warn(`ERROR DURING SEND SCHEDULED MESSAGES -> GLOBAL`);
  }
}

function random({ array = [] }) {
  return array[Math.floor(Math.random() * array.length)];
}

async function randomText({ type }) {
  const start = await getTextsFromDB({ type });
  const ending = await getTextsFromDB({ type: "noun" });

  return random({ array: start }) + ", " + random({ array: ending }) + "!";
}

async function randomSticker({}) {
  const stickers = await getStickersFromDB({});
  return random({ array: stickers });
}

async function getTextsFromDB({ type = "frequent" }) {
  try {
    const texts = await database.collection("texts").find({ type }).toArray();
    return texts.map((t) => t.value);
  } catch (e) {
    console.log(e);
    console.warn("CANNOT GET TEXTS FROM DB -> " + chat_id);
    return [];
  }
}

async function getStickersFromDB({}) {
  try {
    const stickers = await database.collection("stickers").find().toArray();
    return stickers.map((t) => t.value);
  } catch (e) {
    console.log(e);
    console.warn("CANNOT GET STICKERS FROM DB -> " + chat_id);
    return [];
  }
}

async function isUserEnabled({ chat_id }) {
  try {
    const user = await database
      .collection("members")
      .countDocuments({ chat_id: Number(chat_id), enabled: true });
    return Boolean(user);
  } catch (e) {
    console.log(e);
    console.warn("CANNOT CHECK IS USER EXISTS -> " + chat_id);
    return [];
  }
}

async function isUserExists({ chat_id }) {
  try {
    const user = await database
      .collection("members")
      .countDocuments({ chat_id: Number(chat_id) });
    return Boolean(user);
  } catch (e) {
    console.log(e);
    console.warn("CANNOT CHECK IS USER EXISTS -> " + chat_id);
    return [];
  }
}

async function insertMessage({
  from,
  to,
  message = null,
  type = null,
  reply = null,
}) {
  try {
    await database.collection("messages").insertOne({
      to,
      from,
      type,
      reply,
      message,
      createdAt: new Date(),
    });
    return true;
  } catch (e) {
    console.log(e);
    console.warn("CANNOT INSERT A MESSAGE");
    return false;
  }
}

async function getMembers({}) {
  try {
    return await database
      .collection("members")
      .find({ enabled: true })
      .toArray();
  } catch (e) {
    console.log(e);
    console.warn("NO MEMBERS FOUND IN THE DATABASE");
    return [];
  }
}

async function updateMember({ chat_id, update }) {
  try {
    await database
      .collection("members")
      .findOneAndUpdate({ chat_id: Number(chat_id) }, { $set: update });
    return true;
  } catch (e) {
    console.log(e);
    console.warn("CANNOT UPDATE A USER -> " + chat_id);
    return false;
  }
}

async function insertMember({ chat_id, username }) {
  try {
    await client.connect();
    const database = client.db("telegram-bot");
    await database.collection("members").insertOne({
      chat_id: Number(chat_id),
      username,
      enabled: true,
      timezone: "GMT+3",
    });
    return true;
  } catch (e) {
    console.log(e);
    console.warn("CANNOT INSERT A USER -> " + chat_id + " " + username);
    return false;
  }
}
