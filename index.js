import { Telegraf } from "telegraf";
import cron from 'node-cron';

const API_KEY_BOT = 'key';

const bot = new Telegraf(API_KEY_BOT);

const ruMonths = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
const ruDays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

bot.telegram.setMyCommands([
    {
        command: 'start',
        description: 'Запускает бота',
    },
    {
        command: 'book',
        description: 'Команда для бронирования корта. Через пробел указываются часы брони, разделять часы нужно запятой. Пример /book 14,15',
    },
    {
        command: 'unbook',
        description: 'Команда для отмены брони. Через пробел указываются часы брони, разделять часы нужно запятой. Пример /unbook 14,15',
    }
  ]);


bot.start(async (ctx) => {
    if (activeChats[ctx.chat.id]) {
        ctx.reply('Бот уже запущен, пользуйся на здоровье :)');
        return
    };

    ctx.reply(
        `Всем привет! Я бот для бронирования корта. Раз в день, в 18:00, я создаю тему и присылаю туда пустое расписание.

Вы можете забронировать нужно время, используя команду /book. Через пробел указываются часы брони, разделять часы нужно запятой. Пример /book 14,15

Вы можете снять свою бронь, используя команду /unbook. Через пробел указываются часы брони, разделять часы нужно запятой. Пример /unbook 14,15

Мой создатель - @semyart, можете написать ему, если есть какие-то идеи по доработке. Или если вам нужен ТГ бот или свой веб-сайт 😄

Всем добра и хороших тренировок!
        `
    );
    activeChats[ctx.chat.id] = true;

    cron.schedule('0 18 * * *', async () => {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + 3);
        const todayDate = currentDate.getDate();
        const todayMonth = currentDate.getMonth();
        const todayDay = currentDate.getDay();

        const topic = await ctx.createForumTopic(`${ruDays[todayDay]} ${todayDate} ${ruMonths[todayMonth]}`);

        createEmptySchedule(topic.message_thread_id);
        const schedule = getSchedule(threads[topic.message_thread_id]);
        bot.telegram.sendMessage(ctx.chat.id, schedule, { message_thread_id: topic.message_thread_id });
    });
});

const threads = {};
const activeChats = {};

function createEmptySchedule(threadId) {
    const emptySchedule = {};

    for (let hour = 6; hour < 24; hour++) {
        emptySchedule[hour] = null;
    }

    threads[threadId] = emptySchedule;
}

function getSchedule(threadObject) {
    let scheduleString = '';
    for (const [key, value] of Object.entries(threadObject)) {
        scheduleString += `${key}:00 — ${value ?? ''} \n`;
    }

    return scheduleString;
}

function isUserHasAvailableHours(threadObject, userId, dayIndex) {
    const hoursAvailable = (dayIndex === 0 || dayIndex === 6) ? 1 : 2;
    const userHours = Object.values(threadObject).reduce((hoursCount, threadValue) => {
        if (threadValue === null) {
            return hoursCount;
        }

        const threadUserId = threadValue.split(' id:')[1];
        return +userId === +threadUserId ? hoursCount + 1 : hoursCount;
    }, 0);

    return userHours >= hoursAvailable ? false : true;
}

bot.command('book', async (ctx) => {
    if (ctx.message.message_thread_id) {
        const timeArray = ctx.payload.split(',');
        let isTimeBooked = false;

        for (const time of timeArray) {
            let chosenTime = null;
            try {
                chosenTime = threads[ctx.message.message_thread_id][time];
            } catch (e) {
                ctx.reply('К сожалению, бот был отключен на некоторое время. Дальнейшая запись проводится вручную.');
                return;
            }

            const dayIndex = ruDays.indexOf(ctx.message.reply_to_message.forum_topic_created.name.split(' ')[0]);
            if (!isUserHasAvailableHours(threads[ctx.message.message_thread_id], ctx.from.id, dayIndex)) {
                ctx.reply('Вы пытаетесь превысить ограничение по времени. Напоминаю, в будние дни 2ч, в выходные 1ч.');
                break;
            }

            if (chosenTime === null) {
                threads[ctx.message.message_thread_id][time] = `${ctx.from.first_name} id:${ctx.from.id}`;
                isTimeBooked = true;
                continue;
            }

            if (chosenTime === undefined) {
                ctx.reply('Некорректный формат времени');
                continue;
            }

            if (chosenTime) {
                ctx.reply(`${time}:00 - это время уже занято, выберите другое`);
                continue;
            }
        }

        if (isTimeBooked) {
            const schedule = getSchedule(threads[ctx.message.message_thread_id]);
            ctx.reply(schedule);
        }
    } else {
        ctx.reply('Эта команда работает только внутри созданных мной тем.');
    }
})

bot.command('unbook', async (ctx) => {
    if (ctx.message.message_thread_id) {
        const timeArray = ctx.payload.split(',');
        let isTimeUnBooked = false;

        for (const time of timeArray) {
            let chosenTime = null;
            try {
                chosenTime = threads[ctx.message.message_thread_id][time];
            } catch (e) {
                ctx.reply('К сожалению, бот был отключен на некоторое время. Дальнейшая запись проводится вручную.');
                return;
            }

            const bookTimeValue = threads[ctx.message.message_thread_id][time];
            if (bookTimeValue === null) {
                ctx.reply(`${time}:00 - это время и так свободно, смело записывайся :)`);
                continue;
            }

            if (chosenTime === undefined) {
                ctx.reply('Некорректный формат времени');
                continue;
            }

            const timeUserId = bookTimeValue.split(' id:')[1];
            if (+timeUserId !== +ctx.from.id) {
                ctx.reply(`Вы пытаетесь отменить бронь другого пользователя, аккуратнее :)`);
                continue;
            }

            threads[ctx.message.message_thread_id][time] = null;
            isTimeUnBooked = true;
        }

        if (isTimeUnBooked) {
            const schedule = getSchedule(threads[ctx.message.message_thread_id]);
            ctx.reply(schedule);
        }
    } else {
        ctx.reply('Эта команда работает только внутри созданных мной тем.');
    }
});

bot.launch()