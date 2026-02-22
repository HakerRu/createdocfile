const express = require('express');
const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, ImageRun, BorderStyle } = require('docx');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Константы
const CHARS_PER_PAGE = 2000;
const BROWN_COLOR = "9b6c4b";

// ========== РАЗБИЕНИЕ НА СТРАНИЦЫ ==========
function splitTextIntoPages(text) {
    if (!text || text.length === 0) return [];

    const pages = [];
    let currentPage = '';

    console.log('📄 Разбиение текста на страницы...');

    const taskBlocks = text.split(/(?=ЗАДАНИЕ \d+)/);

    taskBlocks.forEach(block => {
        if (!block.trim()) return;

        if ((currentPage.length + block.length) <= CHARS_PER_PAGE) {
            currentPage += block;
        } else {
            if (currentPage.trim()) {
                pages.push(currentPage.trim());
                currentPage = '';
            }

            if (block.length > CHARS_PER_PAGE) {
                let remainingBlock = block;
                while (remainingBlock.length > 0) {
                    if (remainingBlock.length <= CHARS_PER_PAGE) {
                        if (currentPage) {
                            pages.push(currentPage.trim());
                            currentPage = '';
                        }
                        pages.push(remainingBlock.trim());
                        break;
                    } else {
                        let chunk = remainingBlock.substring(0, CHARS_PER_PAGE);
                        let splitPoint = findSplitPoint(chunk);

                        const pageText = remainingBlock.substring(0, splitPoint).trim();
                        if (currentPage) {
                            pages.push(currentPage.trim());
                            currentPage = '';
                        }
                        pages.push(pageText);
                        remainingBlock = remainingBlock.substring(splitPoint).trim();
                    }
                }
            } else {
                currentPage = block;
            }
        }
    });

    if (currentPage.trim()) {
        pages.push(currentPage.trim());
    }

    console.log(`✅ Создано страниц: ${pages.length}`);
    return pages;
}

function findSplitPoint(chunk) {
    let splitPoint = -1;

    let lastSemicolon = chunk.lastIndexOf(';');
    if (lastSemicolon > CHARS_PER_PAGE * 0.5) splitPoint = lastSemicolon + 1;

    if (splitPoint === -1) {
        let lastPeriod = chunk.lastIndexOf('.');
        if (lastPeriod > CHARS_PER_PAGE * 0.5) splitPoint = lastPeriod + 1;
    }

    if (splitPoint === -1) {
        let lastNewLine = chunk.lastIndexOf('\n');
        if (lastNewLine > CHARS_PER_PAGE * 0.5) splitPoint = lastNewLine + 1;
    }

    if (splitPoint === -1) {
        let lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > CHARS_PER_PAGE * 0.5) splitPoint = lastSpace + 1;
    }

    if (splitPoint === -1) {
        splitPoint = Math.floor(CHARS_PER_PAGE * 0.8);
    }

    return splitPoint;
}

// Функция для создания колонтитулов
function createHeaderAndFooter(pageNumber, totalPages, docType = 'tasks') {
    const header = new Header({
        children: [
            new Paragraph({
                children: [
                    new ImageRun({
                        data: fs.existsSync(path.join(__dirname, 'templates/logo.png'))
                            ? fs.readFileSync(path.join(__dirname, 'templates/logo.png'))
                            : Buffer.from(''),
                        transformation: {
                            width: 100,
                            height: 35,
                        },
                    }),
                ],
                alignment: AlignmentType.LEFT,
                spacing: { after: 120 },
                border: {
                    bottom: {
                        color: BROWN_COLOR,
                        space: 4,
                        style: BorderStyle.SINGLE,
                        size: 2,
                    }
                }
            }),
        ],
    });

    const footerText = docType === 'tasks'
        ? 'Документ с заданиями создан с помощью платформы TUT-HELP.ru'
        : 'Документ с ответами создан с помощью платформы TUT-HELP.ru';

    const footer = new Footer({
        children: [
            // Первый параграф - текст по центру
            new Paragraph({
                children: [
                    new TextRun({
                        text: footerText,
                        bold: false,
                        size: 20,
                        color: "666666",
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 20 },
            }),
            // Второй параграф - номер страницы по центру
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${pageNumber}`,
                        bold: true,
                        size: 24,
                        color: BROWN_COLOR,
                    }),
                ],
                alignment: AlignmentType.CENTER,
                border: {
                    top: {
                        color: BROWN_COLOR,
                        space: 4,
                        style: BorderStyle.SINGLE,
                        size: 2,
                    }
                },
                spacing: { before: 20, after: 60 },
            }),
        ],
    });

    return { header, footer };
}

// ========== ФУНКЦИИ ДЛЯ ФОРМАТИРОВАНИЯ РАЗНЫХ ТИПОВ ЗАДАНИЙ ==========

// Tool 1: Word-Image Matching
function formatTool1(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nСОЕДИНИТЕ КАРТИНКИ СО СЛОВАМИ:\n\n`;

    const images = task.task?.images || [];
    images.forEach(img => {
        taskText += `[Изображение ${img.number}]\n`;
    });

    const wordBank = task.task?.wordBank || [];
    if (wordBank.length > 0) {
        taskText += `\nБанк слов:\n`;
        wordBank.forEach((word, i) => {
            taskText += `   ${String.fromCharCode(97 + i)}. ${word}\n`;
        });
    }

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ОТВЕТЫ:\n`;
        task.answers.forEach(answer => {
            taskText += `   • ${answer}\n`;
        });
    } else {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `Напишите соответствия: ____________________\n`;
    }

    return taskText;
}

// Tool 3: Fill in the Gap
function formatTool3(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nЗАДАНИЕ:\n`;

    const text = task.task?.text || '';

    if (includeAnswers && task.answers) {
        let filledText = text;
        if (Array.isArray(task.answers)) {
            task.answers.forEach(answer => {
                const match = answer.match(/^(\d+)\s+(.+)$/);
                if (match) {
                    const number = match[1];
                    const correctAnswer = match[2];
                    const pattern = `\\(${number}\\) ______`;
                    const replacement = `(${number}) ${correctAnswer}`;
                    filledText = filledText.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
                }
            });
        }
        taskText += `${filledText}\n`;
    } else {
        taskText += `${text}\n`;
    }

    const wordBank = task.task?.wordBank || [];
    if (wordBank.length > 0) {
        taskText += `\nБанк слов:\n`;
        wordBank.forEach((word, i) => {
            taskText += `   ${i + 1}. ${word}\n`;
        });
    }

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ОТВЕТЫ:\n`;
        task.answers.forEach(answer => {
            taskText += `   • ${answer}\n`;
        });
    } else {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `ОТВЕТ: ____________________\n`;
    }

    return taskText;
}

// Tool 8: Discussion Questions
function formatTool8(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nВОПРОСЫ ДЛЯ ОБСУЖДЕНИЯ:\n\n`;

    const questions = task.task?.questions || [];
    questions.forEach((q, i) => {
        if (typeof q === 'object') {
            taskText += `${q.number || i + 1}. ${q.question}\n`;
            if (q.highlightedWords && q.highlightedWords.length > 0) {
                taskText += `   Ключевые слова: ${q.highlightedWords.join(', ')}\n`;
            }
            taskText += `\n`;
        } else {
            taskText += `${i + 1}. ${q}\n\n`;
        }
    });

    return taskText;
}

// Tool 10: Word-Definition Matching
function formatTool10(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nСОЕДИНИТЕ СЛОВА С ОПРЕДЕЛЕНИЯМИ:\n\n`;

    const words = task.task?.words || [];
    const definitions = task.task?.definitions_shuffled || [];

    taskText += `СЛОВА:\n`;
    words.forEach((word, i) => {
        taskText += `   ${i + 1}. ${word}\n`;
    });

    taskText += `\nОПРЕДЕЛЕНИЯ:\n`;
    definitions.forEach((def, i) => {
        taskText += `   ${String.fromCharCode(97 + i)}. ${def}\n`;
    });

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ОТВЕТЫ:\n`;
        task.answers.forEach(answer => {
            taskText += `   • ${answer}\n`;
        });
    } else {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `Напишите соответствия (например: 1-a, 2-b): ____________________\n`;
    }

    return taskText;
}

// Tool 15: Simplify or Update Text
function formatTool15(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nОРИГИНАЛЬНЫЙ ТЕКСТ:\n`;
    taskText += `${task.task?.original_text || ''}\n`;

    if (includeAnswers) {
        taskText += `\n✅ УПРОЩЕННЫЙ ТЕКСТ:\n`;
        taskText += `${task.task?.simplified_text || ''}\n`;

        if (task.answers?.metadata) {
            taskText += `\n📊 СТАТИСТИКА:\n`;
            task.answers.metadata.forEach(item => {
                taskText += `   • ${item}\n`;
            });
        }
    } else {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `Упростите текст: ____________________\n`;
    }

    return taskText;
}

// Tool 17: Interesting Facts
function formatTool17(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nИНТЕРЕСНЫЕ ФАКТЫ:\n`;

    const facts = task.task?.facts || [];
    facts.forEach((fact, i) => {
        taskText += `\n${i + 1}. ${fact}\n`;
    });

    return taskText;
}

// Tool 19: Matching Halves
function formatTool19(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nСОЕДИНИТЕ ЧАСТИ ПРЕДЛОЖЕНИЙ:\n\n`;

    const left = task.task?.left || [];
    const right = task.task?.right || [];

    taskText += `ЛЕВАЯ ЧАСТЬ:\n`;
    left.forEach(item => taskText += `${item}\n`);

    taskText += `\nПРАВАЯ ЧАСТЬ:\n`;
    right.forEach(item => taskText += `${item}\n`);

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ПРАВИЛЬНЫЕ ПАРЫ:\n`;
        task.answers.forEach(answer => {
            taskText += `   • ${answer}\n`;
        });
    } else {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `Напишите соответствия (например: 1-a, 2-b): ____________________\n`;
    }

    return taskText;
}

// Tool 21: Rephrase Using the Word Given
function formatTool21(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nПЕРЕФРАЗИРУЙТЕ, ИСПОЛЬЗУЯ ДАННОЕ СЛОВО:\n\n`;

    const sentences = task.task?.sentences || [];
    sentences.forEach((item, i) => {
        taskText += `${item.number || i + 1}. Оригинал: ${item.original || ''}\n`;
        taskText += `   Ключевое слово: ${item.keyword || ''}\n`;
        if (!includeAnswers) {
            taskText += `   ${item.blank || ''}\n`;
        }
        taskText += `\n`;
    });

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ОТВЕТЫ:\n`;
        task.answers.forEach(answer => {
            taskText += `   • ${answer}\n`;
        });
    } else if (!includeAnswers) {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `ОТВЕТ: ____________________\n`;
    }

    return taskText;
}

// Tool 23: Text with Vocabulary
function formatTool23(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nТЕКСТ:\n`;
    taskText += `${task.task?.text || ''}\n`;

    const vocabulary = task.task?.vocabulary_used || [];
    if (vocabulary.length > 0) {
        taskText += `\n📖 ИСПОЛЬЗУЕМАЯ ЛЕКСИКА:\n`;
        vocabulary.forEach((word, i) => {
            taskText += `   ${i + 1}. ${word}\n`;
        });
    }

    return taskText;
}

// Tool 24: Scramble Sentences
function formatTool24(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nСОСТАВЬТЕ ПРЕДЛОЖЕНИЯ ИЗ СЛОВ:\n\n`;

    const scrambled = task.task?.scrambled || [];
    scrambled.forEach((sentence, i) => {
        taskText += `${i + 1}. ${sentence}\n\n`;
    });

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ПРАВИЛЬНЫЕ ПРЕДЛОЖЕНИЯ:\n`;
        task.answers.forEach(answer => {
            taskText += `   • ${answer}\n`;
        });
    } else {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `ОТВЕТ: ____________________\n`;
    }

    return taskText;
}

// Tool 26: Extract Vocabulary
function formatTool26(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    const sourceText = task.task?.source_text || task.task?.text || '';
    if (sourceText) {
        taskText += `\nИСХОДНЫЙ ТЕКСТ:\n`;
        taskText += `${sourceText}\n`;
    }

    const extractedWords = task.task?.extracted_words || [];
    if (extractedWords.length > 0) {
        taskText += `\n📚 ВЫДЕЛЕННАЯ ЛЕКСИКА:\n\n`;

        extractedWords.forEach((item, i) => {
            if (typeof item === 'object') {
                taskText += `${i + 1}. ${item.word || ''}\n`;
                if (item.definition) taskText += `   Значение: ${item.definition}\n`;
                if (item.context) taskText += `   Контекст: "${item.context}"\n`;
                taskText += `\n`;
            } else if (typeof item === 'string') {
                const parts = item.split(' - ');
                const word = parts[0];
                const rest = parts[1] || '';

                const contextMatch = rest.match(/^(.*?)\. Context: (.*)$/);

                if (contextMatch) {
                    const definition = contextMatch[1];
                    const context = contextMatch[2];

                    taskText += `${i + 1}. ${word}\n`;
                    taskText += `   Значение: ${definition}\n`;
                    taskText += `   Контекст: "${context}"\n\n`;
                } else {
                    taskText += `${i + 1}. ${item}\n\n`;
                }
            }
        });
    }

    return taskText;
}

// Универсальная функция для неизвестных типов
function formatGenericTask(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    if (task.task) {
        if (typeof task.task === 'object') {
            const possibleTextFields = ['text', 'source_text', 'original_text', 'description', 'content'];
            let textFound = false;

            for (const field of possibleTextFields) {
                if (task.task[field] && typeof task.task[field] === 'string') {
                    taskText += `\nТЕКСТ:\n${task.task[field]}\n`;
                    textFound = true;
                    break;
                }
            }

            if (task.task.extracted_words && Array.isArray(task.task.extracted_words)) {
                taskText += `\n📚 ВЫДЕЛЕННАЯ ЛЕКСИКА:\n\n`;
                task.task.extracted_words.forEach((item, i) => {
                    if (typeof item === 'string') {
                        taskText += `${i + 1}. ${item}\n\n`;
                    } else if (typeof item === 'object') {
                        taskText += `${i + 1}. ${JSON.stringify(item)}\n\n`;
                    }
                });
            }

            if (!textFound && Object.keys(task.task).length > 0) {
                taskText += `\nДАННЫЕ ЗАДАНИЯ:\n`;
                taskText += `${JSON.stringify(task.task, null, 2)}\n`;
            }
        } else if (typeof task.task === 'string') {
            taskText += `\nТЕКСТ:\n${task.task}\n`;
        }
    }

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ОТВЕТЫ:\n`;
        if (Array.isArray(task.answers)) {
            task.answers.forEach(answer => {
                if (typeof answer === 'object') {
                    taskText += `   • ${JSON.stringify(answer)}\n`;
                } else {
                    taskText += `   • ${answer}\n`;
                }
            });
        } else if (typeof task.answers === 'object') {
            taskText += `   ${JSON.stringify(task.answers, null, 2)}\n`;
        }
    } else if (!includeAnswers && task.tool_id === 26) {
        if (!task.task?.extracted_words) {
            taskText += `\n${'─'.repeat(40)}\n`;
            taskText += `Изучите лексику из текста\n`;
        }
    } else if (!includeAnswers) {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `ОТВЕТ: ____________________\n`;
    }

    return taskText;
}

// Главная функция форматирования по tool_id
function formatTaskByTool(task, index, includeAnswers = false) {
    const toolId = task.tool_id;

    switch (toolId) {
        case 1: return formatTool1(task, index, includeAnswers);
        case 3: return formatTool3(task, index, includeAnswers);
        case 8: return formatTool8(task, index, includeAnswers);
        case 10: return formatTool10(task, index, includeAnswers);
        case 15: return formatTool15(task, index, includeAnswers);
        case 17: return formatTool17(task, index, includeAnswers);
        case 19: return formatTool19(task, index, includeAnswers);
        case 21: return formatTool21(task, index, includeAnswers);
        case 23: return formatTool23(task, index, includeAnswers);
        case 24: return formatTool24(task, index, includeAnswers);
        case 26: return formatTool26(task, index, includeAnswers);
        default: return formatGenericTask(task, index, includeAnswers);
    }
}

// Генерация текста для документа с заданиями
function generateTasksText(data) {
    let fullText = '';

    if (data.group_title) {
        fullText += `${data.group_title}\n`;
        fullText += `${'═'.repeat(data.group_title.length)}\n\n`;
    }

    if (data.tasks && Array.isArray(data.tasks)) {
        data.tasks.forEach((task, index) => {
            fullText += formatTaskByTool(task, index, false);
            if (index < data.tasks.length - 1) {
                fullText += `\n${'─'.repeat(60)}\n`;
            }
        });
    }

    return fullText;
}

// Генерация текста для документа с ответами
function generateAnswersText(data) {
    let fullText = '';

    if (data.group_title) {
        fullText += `${data.group_title} - ОТВЕТЫ\n`;
        fullText += `${'═'.repeat(data.group_title.length + 8)}\n\n`;
    }

    if (data.tasks && Array.isArray(data.tasks)) {
        data.tasks.forEach((task, index) => {
            fullText += formatTaskByTool(task, index, true);
            if (index < data.tasks.length - 1) {
                fullText += `\n${'─'.repeat(60)}\n`;
            }
        });
    }

    return fullText;
}

// Преобразование текста в параграфы Word
function textToParagraphs(text, isAnswers = false) {
    if (!text) return [new Paragraph({ children: [new TextRun("")] })];

    return text.split('\n').map(line => {
        // Заголовок группы
        if (line.match(/^[A-Za-zА-Яа-я\s-]+$/) && line.length < 60 && !line.includes('•') && !line.includes('═') && !line.includes('ОТВЕТЫ')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 36,
                    color: BROWN_COLOR,
                })],
                spacing: { before: 400, after: 200 },
                alignment: AlignmentType.CENTER,
            });
        }

        // Заголовок с ОТВЕТЫ
        if (line.includes('ОТВЕТЫ')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 32,
                    color: BROWN_COLOR,
                })],
                spacing: { before: 400, after: 200 },
                alignment: AlignmentType.CENTER,
            });
        }

        // Линия из символов ═
        if (line.includes('═'.repeat(10))) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    color: BROWN_COLOR,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
            });
        }

        // Линия из символов ─
        if (line.includes('─'.repeat(10))) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    color: "999999",
                })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 150, after: 150 },
            });
        }

        // Заголовок ЗАДАНИЕ
        if (line.includes('ЗАДАНИЕ')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 32,
                    color: BROWN_COLOR,
                })],
                spacing: { before: 400, after: 100 },
            });
        }

        // Заголовки секций
        if (line.includes('ИНСТРУКЦИЯ:') || line.includes('ЗАДАНИЕ:') ||
            line.includes('✅ ОТВЕТЫ:') || line.includes('✅ ПРАВИЛЬНЫЕ ПАРЫ:') ||
            line.includes('✅ ПРАВИЛЬНЫЕ ПРЕДЛОЖЕНИЯ:')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 28,
                    color: BROWN_COLOR,
                })],
                spacing: { before: 200, after: 100 },
            });
        }

        // Специальные заголовки
        if (line.includes('ИНТЕРЕСНЫЕ ФАКТЫ:') || line.includes('📖 ИСПОЛЬЗУЕМАЯ ЛЕКСИКА:') ||
            line.includes('ЛЕВАЯ ЧАСТЬ:') || line.includes('ПРАВАЯ ЧАСТЬ:') ||
            line.includes('ВОПРОСЫ ДЛЯ ОБСУЖДЕНИЯ:') || line.includes('ИСХОДНЫЙ ТЕКСТ:') ||
            line.includes('ОРИГИНАЛЬНЫЙ ТЕКСТ:') || line.includes('СОЕДИНИТЕ КАРТИНКИ СО СЛОВАМИ:') ||
            line.includes('📊 СТАТИСТИКА:') || line.includes('ПЕРЕФРАЗИРУЙТЕ, ИСПОЛЬЗУЯ ДАННОЕ СЛОВО:') ||
            line.includes('СОЕДИНИТЕ СЛОВА С ОПРЕДЕЛЕНИЯМИ:')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 26,
                    color: BROWN_COLOR,
                })],
                spacing: { before: 150, after: 50 },
            });
        }

        // Банк слов
        if (line.includes('Банк слов:')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    italics: true,
                    size: 24,
                    color: "666666",
                })],
                spacing: { before: 150, after: 50 },
            });
        }

        // Нумерованные пункты
        if (line.match(/^\s*\d+\./)) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                })],
                indent: { left: 360 },
                spacing: { before: 20, after: 20 },
            });
        }

        // Буквенные пункты (a., b., c.)
        if (line.match(/^\s*[a-z]\./)) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                })],
                indent: { left: 360 },
                spacing: { before: 20, after: 20 },
            });
        }

        // Ответы с буллетами
        if (line.trim().startsWith('•') || line.trim().startsWith('   •')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                    color: isAnswers ? "2E7D32" : "444444",
                    bold: isAnswers,
                })],
                indent: { left: 360 },
                spacing: { before: 10, after: 10 },
            });
        }

        // Текст с подставленными ответами
        if (line.includes('(') && line.includes(')') && isAnswers) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                })],
                spacing: { before: 60, after: 60 },
            });
        }

        // Место для ответа
        if ((line.includes('ОТВЕТ: ____________________') ||
            line.includes('Напишите соответствия:')) && !isAnswers) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                    color: "999999",
                    italics: true,
                })],
                spacing: { before: 30, after: 30 },
                indent: { left: 360 },
            });
        }

        // [Изображение X] - плейсхолдер для картинок
        if (line.includes('[Изображение')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                    color: "666666",
                    italics: true,
                })],
                spacing: { before: 30, after: 30 },
                alignment: AlignmentType.CENTER,
            });
        }

        // Ключевые слова
        if (line.includes('Ключевые слова:')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 22,
                    color: "888888",
                    italics: true,
                })],
                indent: { left: 720 },
                spacing: { before: 5, after: 15 },
            });
        }

        // Значение и контекст
        if (line.includes('Значение:') || line.includes('Контекст:') ||
            line.includes('Оригинал:') || line.includes('Ключевое слово:')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 22,
                    color: "666666",
                })],
                indent: { left: 720 },
                spacing: { before: 5, after: 5 },
            });
        }

        // Обычный текст
        if (line.trim()) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                })],
                spacing: { before: 60, after: 60 },
            });
        }

        return new Paragraph({
            children: [new TextRun("")],
        });
    });
}

// Генерация Word документа
async function generateWordDocument(text, title, docType = 'tasks') {
    console.log(`\n📝 Создание документа (${docType})...`);

    const pages = splitTextIntoPages(text);
    const totalPages = pages.length;

    const sections = pages.map((pageText, index) => {
        const pageNumber = index + 1;
        console.log(`   Создание страницы ${pageNumber} из ${totalPages}...`);

        const { header, footer } = createHeaderAndFooter(pageNumber, totalPages, docType);
        const paragraphs = textToParagraphs(pageText, docType === 'answers');

        return {
            properties: {
                page: {
                    pageNumbers: {
                        start: pageNumber,
                    }
                }
            },
            headers: {
                default: header,
            },
            footers: {
                default: footer,
            },
            children: paragraphs,
        };
    });

    console.log(`✅ Создано ${sections.length} страниц`);

    const doc = new Document({
        sections: sections,
        properties: {
            title: title,
            subject: "Английский язык",
            creator: "TUT-HELP.ru",
        },
    });

    return await Packer.toBuffer(doc);
}

// Создание ZIP архива
async function createZipWithDocuments(tasksBuffer, answersBuffer) {
    const zip = new JSZip();
    zip.file("tasks.docx", tasksBuffer);
    zip.file("answers.docx", answersBuffer);
    return await zip.generateAsync({ type: "nodebuffer" });
}

// ========== ОСНОВНОЙ ЭНДПОИНТ ==========
app.post('/api/pdf/generate', async (req, res) => {
    try {
        console.log('\n📄 ===== НАЧАЛО ГЕНЕРАЦИИ =====');

        const jsonData = req.body;

        console.log(`📋 Группа: ${jsonData.group_title || 'Без названия'}`);
        console.log(`📊 Заданий: ${jsonData.tasks?.length || 0}`);

        // Генерация текста
        const tasksText = generateTasksText(jsonData);
        const answersText = generateAnswersText(jsonData);

        // Генерация Word документов
        const tasksBuffer = await generateWordDocument(
            tasksText,
            jsonData.group_title || "Задания",
            'tasks'
        );

        const answersBuffer = await generateWordDocument(
            answersText,
            `${jsonData.group_title || "Задания"} - ОТВЕТЫ`,
            'answers'
        );

        // 📁 СОЗДАЕМ ПАПКУ output ЕСЛИ ЕЁ НЕТ
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
            console.log('📁 Создана папка output');
        }

        // 💾 СОХРАНЯЕМ ФАЙЛЫ
        const timestamp = Date.now();
        const tasksPath = path.join(outputDir, `tasks_${timestamp}.docx`);
        const answersPath = path.join(outputDir, `answers_${timestamp}.docx`);

        fs.writeFileSync(tasksPath, tasksBuffer);
        fs.writeFileSync(answersPath, answersBuffer);

        console.log(`💾 Сохранено:\n   📄 ${tasksPath}\n   📄 ${answersPath}`);

        // 📦 СОЗДАЕМ ZIP ДЛЯ ОТПРАВКИ
        const zipBuffer = await createZipWithDocuments(tasksBuffer, answersBuffer);

        const filename = `tasks_${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        console.log(`📤 Отправка ZIP (${zipBuffer.length} байт)...`);
        res.send(zipBuffer);

    } catch (error) {
        console.error('❌ ОШИБКА:', error);
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Старый эндпоинт для обратной совместимости
app.post('/api/generate-word', async (req, res) => {
    try {
        console.log('\n📄 НАЧАЛО ГЕНЕРАЦИИ (старый эндпоинт)');

        const jsonData = req.body;

        console.log(`📋 Группа: ${jsonData.group_title || 'Без названия'}`);
        console.log(`📊 Заданий: ${jsonData.tasks?.length || 0}`);

        const tasksText = generateTasksText(jsonData);
        const answersText = generateAnswersText(jsonData);

        const tasksBuffer = await generateWordDocument(
            tasksText,
            jsonData.group_title || "Задания",
            'tasks'
        );

        const answersBuffer = await generateWordDocument(
            answersText,
            `${jsonData.group_title || "Задания"} - ОТВЕТЫ`,
            'answers'
        );

        // 📁 СОЗДАЕМ ПАПКУ output ЕСЛИ ЕЁ НЕТ
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }

        // 💾 СОХРАНЯЕМ ФАЙЛЫ
        const timestamp = Date.now();
        const tasksPath = path.join(outputDir, `tasks_${timestamp}.docx`);
        const answersPath = path.join(outputDir, `answers_${timestamp}.docx`);

        fs.writeFileSync(tasksPath, tasksBuffer);
        fs.writeFileSync(answersPath, answersBuffer);

        console.log(`💾 Сохранено:\n   📄 ${tasksPath}\n   📄 ${answersPath}`);

        // 📦 СОЗДАЕМ ZIP ДЛЯ ОТПРАВКИ
        const zipBuffer = await createZipWithDocuments(tasksBuffer, answersBuffer);

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=tuthelp_${timestamp}.zip`);
        res.send(zipBuffer);

    } catch (error) {
        console.error('❌ ОШИБКА:', error);
        res.status(500).json({ error: error.message });
    }
});

// API info
app.get('/api/info', (req, res) => {
    res.json({
        status: 'online',
        version: '4.4.0',
        features: [
            'Задания не разрываются между страницами',
            'Простая нумерация страниц (1, 2, 3...)',
            'Коричневые заголовки',
            'Два документа: задания и ответы',
            'Поддержка 10 типов заданий',
            'Умное извлечение текста из разных полей',
            'Поддержка highlighted words',
            'Статистика в Simplify Text'
        ],
        supported_tools: [1, 3, 8, 10, 15, 17, 19, 21, 23, 24, 26],
        endpoints: {
            generate: 'POST /api/pdf/generate',
            old_generate: 'POST /api/generate-word',
            info: 'GET /api/info'
        }
    });
});

// Тестовый эндпоинт
app.post('/api/pdf/test', (req, res) => {
    res.json({
        message: 'PDF service is running',
        receivedBody: req.body,
        endpoints: {
            generate: 'POST /api/pdf/generate',
            info: 'GET /api/info'
        }
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TUTHELP PDF Generator</title>
            <style>
                body { font-family: Arial; max-width: 800px; margin: 40px auto; padding: 20px; }
                h1 { color: #9b6c4b; }
                .btn { background: #9b6c4b; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; }
                .btn:hover { background: #7b4c3b; }
                .info { background: #f5f5f5; padding: 20px; border-radius: 10px; }
                .feature { color: #9b6c4b; margin: 5px 0; }
                .tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
                .tool-tag { background: #e0e0e0; padding: 5px 10px; border-radius: 15px; text-align: center; font-size: 14px; }
            </style>
        </head>
        <body>
            <h1>📚 TUTHELP PDF Generator v4.4</h1>
            <div class="info">
                <p>✅ Сервер работает</p>
                <p class="feature">✓ Задания не разрываются между страницами</p>
                <p class="feature">✓ Простая нумерация страниц (1, 2, 3...)</p>
                <p class="feature">✓ Коричневые заголовки</p>
                <p class="feature">✓ Два документа: задания и ответы</p>
                <p class="feature">✓ Поддержка 11 типов заданий</p>
                
                <div class="tools">
                    <span class="tool-tag">Tool 1: Image-Word</span>
                    <span class="tool-tag">Tool 3: Fill Gap</span>
                    <span class="tool-tag">Tool 8: Discussion</span>
                    <span class="tool-tag">Tool 10: Word-Def</span>
                    <span class="tool-tag">Tool 15: Simplify</span>
                    <span class="tool-tag">Tool 17: Facts</span>
                    <span class="tool-tag">Tool 19: Matching</span>
                    <span class="tool-tag">Tool 21: Rephrase</span>
                    <span class="tool-tag">Tool 23: Text+Voca</span>
                    <span class="tool-tag">Tool 24: Scramble</span>
                    <span class="tool-tag">Tool 26: Extract</span>
                </div>
            </div>
            <button class="btn" onclick="test()">📥 Тестовый запрос</button>
            <script>
                async function test() {
                    const res = await fetch('/api/pdf/test', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({test: true})
                    });
                    const data = await res.json();
                    alert('✅ Сервер работает!\n' + JSON.stringify(data, null, 2));
                }
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.clear();
    console.log('\n' + '='.repeat(60));
    console.log('      ✅ TUTHELP PDF GENERATOR v4.4');
    console.log('='.repeat(60));
    console.log(`   🌐 http://localhost:${PORT}`);
    console.log(`   📡 POST /api/pdf/generate - основной эндпоинт`);
    console.log(`   📡 POST /api/generate-word - старый эндпоинт`);
    console.log('='.repeat(60));
    console.log('\n📁 Файлы сохраняются в папку /output');
    console.log('='.repeat(60));
});
