import { Bot } from 'grammy';
import { config } from './config';
import { AIService } from './services/ai.service';
import { GoogleService } from './services/google.service';
import { UserService } from './services/user.service';
import fs from 'fs';
import https from 'https';

import { TodoService } from './services/todo.service';

const bot = new Bot(config.telegramBotToken);
const aiService = new AIService();
const googleService = new GoogleService();
const todoService = new TodoService();
const userService = new UserService();

// Basic Command Handlers
bot.command('start', (ctx) => ctx.reply('Hello! I am your AI Assistant. How can I help you?'));

bot.command('help', (ctx) => {
    ctx.reply(
        'I can help you with:\n' +
        '- Chat & Q&A (AI)\n' +
        '- Personalization: "Call me [Name]", "My job is [Job]"\n' +
        '- Docs Management:\n' +
        '  + "Add Doc [Name] [ID]"\n' +
        '  + "Use Doc [Name]"\n' +
        '  + "Current Doc"\n' +
        '- Scheduling (Type: "Remind me...")\n' +
        '- To-Do List:\n' +
        '  + "Add Task: <content>"\n' +
        '  + "List Tasks" (view list)\n' +
        '  + "Complete Task: <index or keyword>"\n' +
        '- Save Notes (Type: "Save: <content>" or Forward message -> Docs)\n' +
        '- Save Photos (Send photo with caption "Save" or Forward photo -> Docs)'
    );
});

// General Chat Handler
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from?.id;

    // Show typing status
    await ctx.replyWithChatAction('typing');

    if (!userId) {
        await ctx.reply('Error: Unknown User ID.');
        return;
    }

    // --- DOCS MANAGEMENT COMMANDS ---
    // "Add Doc [Alias] [ID]"
    const addDocMatch = text.match(/^add doc\s+(\S+)\s+(\S+)/i);
    if (addDocMatch) {
        const alias = addDocMatch[1];
        const docId = addDocMatch[2];
        userService.setDocAlias(userId, alias, docId);
        await ctx.reply(`✅ Added Doc "${alias}". Set as default if none existed.`);
        return;
    }

    // "Use Doc [Alias/ID]"
    const setDocMatch = text.match(/^use doc\s+(\S+)/i); // or "Select Doc"
    if (setDocMatch) {
        const alias = setDocMatch[1];
        if (userService.setActiveDoc(userId, alias)) {
            await ctx.reply(`✅ Switched to Doc: ${alias}`);
        } else {
            await ctx.reply(`⚠️ Doc "${alias}" not found. Use "Add Doc" first.`);
        }
        return;
    }

    // "Current Doc"
    if (text.toLowerCase() === 'current doc') {
        const activeId = userService.getActiveDocId(userId);
        if (activeId) {
            await ctx.reply(`📂 Current Doc ID: ${activeId}`);
        } else {
            await ctx.reply('📂 Using system default Doc ID (if configured).');
        }
        return;
    }

    // ---------------------------

    // --- TO-DO LIST COMMANDS ---
    if (text.toLowerCase().startsWith('add task:')) {
        const task = text.substring(9).trim(); // "add task:".length = 9
        if (task) {
            todoService.addTodo(userId, task);
            await ctx.reply(`Added task: "${task}"`);
            return;
        }
    }

    if (text.toLowerCase() === 'list tasks' || text.toLowerCase() === 'todo list') {
        const items = todoService.getTodos(userId).filter(i => !i.completed);
        if (items.length === 0) {
            await ctx.reply('You have no pending tasks.');
        } else {
            const list = items.map((i, idx) => `${idx + 1}. ${i.task}`).join('\n');
            await ctx.reply(`Your To-Do List:\n${list}`);
        }
        return;
    }

    if (text.toLowerCase().startsWith('complete task:')) {
        const keyword = text.substring(14).trim(); // "complete task:".length = 14
        if (keyword) {
            const completedItem = todoService.completeTodo(userId, keyword);
            if (completedItem) {
                await ctx.reply(`Marked as done: "${completedItem.task}"`);
            } else {
                await ctx.reply('Task not found.');
            }
            return;
        }
    }
    // ---------------------------

    // 1. Check if user wants to schedule something
    if (text.toLowerCase().includes('schedule') || text.toLowerCase().includes('meeting') || text.toLowerCase().includes('remind')) {
        const calendarData = await aiService.analyzeForCalendar(text);
        if (calendarData) {
            try {
                const eventLink = await googleService.createCalendarEvent(calendarData);
                await ctx.reply(`Created Event: ${calendarData.title}\nTime: ${calendarData.startTime}\nLink: ${eventLink}`);
            } catch (error) {
                await ctx.reply('Error creating calendar event. Please check configuration.');
            }
            return;
        }
    }

    // 2. Personalization Support
    const nameMatch = text.match(/call me (.+)/i) || text.match(/my name is (.+)/i);
    if (nameMatch) {
        const newName = nameMatch[1].trim();
        aiService.getUserService().updateUser(userId, { fullName: newName });
        aiService.refreshSession(userId);
        await ctx.reply(`Hello ${newName}! I have remembered your name.`);
        return;
    }

    const jobMatch = text.match(/my job is (.+)/i) || text.match(/i work as (.+)/i);
    if (jobMatch) {
        const newJob = jobMatch[1].trim();
        aiService.getUserService().updateUser(userId, { jobTitle: newJob });
        aiService.refreshSession(userId);
        await ctx.reply(`I have noted that your job is: ${newJob}`);
        return;
    }

    if (text.toLowerCase().startsWith('remember:')) {
        const note = text.substring(9).trim();
        aiService.getUserService().addNote(userId, note);
        aiService.refreshSession(userId);
        await ctx.reply('Note added to your profile.');
        return;
    }

    // 3. Save to Docs (Command OR Forward)
    // Check for "Save:" command OR if the message is Forwarded
    const isForward = (ctx.message as any).forward_date !== undefined;
    const isSaveCommand = text.toLowerCase().startsWith('save:');

    if (isSaveCommand || isForward) {
        let content = text;
        if (isSaveCommand) {
            content = text.substring(5).trim(); // "Save:".length = 5
        } else {
            content = text;
        }

        const targetDocId = userService.getActiveDocId(userId) || config.googleDocId;

        if (targetDocId) {
            try {
                await googleService.appendToDocs(targetDocId, `${content}`);
                const source = isForward ? 'forwarded message' : 'content';
                try {
                    await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: '❤' }]);
                } catch (e) {
                    // Fallback if reactions are disabled or not supported
                    await ctx.reply(`Saved ${source} to Google Docs (${targetDocId.substring(0, 10)}...).`);
                }
            } catch (error) {
                await ctx.reply('Failed to save to Google Docs.');
            }
        } else {
            await ctx.reply('Google Doc ID not configured. Use "Add Doc [name] [ID]" to set one up.');
        }
        return;
    }

    // 4. Default: Chat with AI
    const response = await aiService.chat(text, userId);
    await ctx.reply(response, { parse_mode: 'Markdown' });
});

// Photo Handler
bot.on('message:photo', async (ctx) => {
    const photo = ctx.message.photo.pop();
    const caption = ctx.message.caption || '';
    const userId = ctx.from?.id;

    if (!photo || !userId) return;

    // Check for "Save" keyword OR if it is a Forward
    const isForward = (ctx.message as any).forward_date !== undefined;
    const hasSaveKeyword = /save/i.test(caption); // No longer checking "lưu" unless requested

    if (!hasSaveKeyword && !isForward) {
        return;
    }

    await ctx.replyWithChatAction('upload_photo');

    try {
        const file = await ctx.api.getFile(photo.file_id);
        if (file.file_path) {
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

            try {
                const targetDocId = userService.getActiveDocId(userId) || config.googleDocId;

                if (targetDocId) {
                    let cleanCaption = caption;
                    if (hasSaveKeyword) {
                        cleanCaption = caption.replace(/^save:?\s*/i, '').trim();
                    } else if (isForward && caption) {
                        cleanCaption = caption;
                    } else if (isForward) {
                        cleanCaption = ``;
                    }

                    await googleService.insertImageToDocs(targetDocId, fileUrl, cleanCaption);

                    try {
                        await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: '❤' }]);
                    } catch (e) {
                        await ctx.reply(`✅ Saved image to Google Docs (${targetDocId.substring(0, 10)}...).`);
                    }
                } else {
                    await ctx.reply('⚠️ Google Doc ID not configured.');
                }
            } catch (docError) {
                console.error('Docs Insert Error:', docError);
                await ctx.reply('⚠️ Failed to save image to Docs.');
            }
        }
    } catch (error) {
        console.error('Photo handling error', error);
        await ctx.reply('Error handling photo.');
    }
});

// Start the bot
bot.start({
    onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} started!`);
    },
});
