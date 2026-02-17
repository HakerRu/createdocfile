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

// Разделяем текст на страницы с сохранением целостности заданий
function splitTextIntoPages(text) {
    if (!text || text.length === 0) return [];

    const pages = [];
    let remainingText = text;
    let pageCount = 0;

    console.log('📄 Разбиение текста на страницы с сохранением заданий...');

    // Разбиваем текст на блоки по заданиям (каждое задание начинается с "ЗАДАНИЕ")
    const taskBlocks = text.split(/(?=ЗАДАНИЕ \d+)/);

    let currentPage = '';

    taskBlocks.forEach(block => {
        // Если блок пустой, пропускаем
        if (!block.trim()) return;

        // Если текущая страница + новый блок не превышают лимит
        if ((currentPage.length + block.length) <= CHARS_PER_PAGE) {
            currentPage += block;
        } else {
            // Если текущая страница не пустая, сохраняем её
            if (currentPage.trim()) {
                pages.push(currentPage.trim());
                console.log(`   Страница ${pages.length}: ${currentPage.length} символов`);
                currentPage = '';
            }

            // Если блок сам по себе больше страницы, разбиваем его принудительно
            if (block.length > CHARS_PER_PAGE) {
                // Разбиваем большой блок на части
                let remainingBlock = block;
                while (remainingBlock.length > 0) {
                    if (remainingBlock.length <= CHARS_PER_PAGE) {
                        if (currentPage) {
                            pages.push(currentPage.trim());
                            console.log(`   Страница ${pages.length}: ${currentPage.length} символов`);
                            currentPage = '';
                        }
                        pages.push(remainingBlock.trim());
                        console.log(`   Страница ${pages.length}: ${remainingBlock.length} символов`);
                        break;
                    } else {
                        // Ищем хорошее место для разрыва внутри блока
                        let chunk = remainingBlock.substring(0, CHARS_PER_PAGE);
                        let splitPoint = findSplitPoint(chunk);

                        const pageText = remainingBlock.substring(0, splitPoint).trim();
                        if (currentPage) {
                            pages.push(currentPage.trim());
                            console.log(`   Страница ${pages.length}: ${currentPage.length} символов`);
                            currentPage = '';
                        }
                        pages.push(pageText);
                        console.log(`   Страница ${pages.length}: ${pageText.length} символов`);

                        remainingBlock = remainingBlock.substring(splitPoint).trim();
                    }
                }
            } else {
                // Начинаем новую страницу с этого блока
                currentPage = block;
            }
        }
    });

    // Добавляем последнюю страницу
    if (currentPage.trim()) {
        pages.push(currentPage.trim());
        console.log(`   Страница ${pages.length}: ${currentPage.length} символов`);
    }

    console.log(`✅ Всего создано страниц: ${pages.length}`);
    return pages;
}

// Поиск места для разрыва
function findSplitPoint(chunk) {
    let splitPoint = -1;

    // Ищем последнюю точку с запятой
    let lastSemicolon = chunk.lastIndexOf(';');
    if (lastSemicolon > CHARS_PER_PAGE * 0.5) splitPoint = lastSemicolon + 1;

    // Ищем последнюю точку
    if (splitPoint === -1) {
        let lastPeriod = chunk.lastIndexOf('.');
        if (lastPeriod > CHARS_PER_PAGE * 0.5) splitPoint = lastPeriod + 1;
    }

    // Ищем последний перевод строки
    if (splitPoint === -1) {
        let lastNewLine = chunk.lastIndexOf('\n');
        if (lastNewLine > CHARS_PER_PAGE * 0.5) splitPoint = lastNewLine + 1;
    }

    // Ищем последний пробел
    if (splitPoint === -1) {
        let lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > CHARS_PER_PAGE * 0.5) splitPoint = lastSpace + 1;
    }

    // Если ничего не нашли, режем по середине
    if (splitPoint === -1) {
        splitPoint = Math.floor(CHARS_PER_PAGE * 0.8);
    }

    return splitPoint;
}

// Функция для создания колонтитулов - ПРОСТАЯ НУМЕРАЦИЯ
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
        ? 'Документ с заданиями создан с помощью платформы TUTHELP.ru'
        : 'Документ с ответами создан с помощью платформы TUTHELP.ru';

    const footer = new Footer({
        children: [
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${pageNumber}`,
                        bold: true,
                        size: 24,
                        color: BROWN_COLOR,
                    }),
                    new TextRun({
                        text: `\t\t\t\t\t\t\t\t${footerText}`,
                        bold: false,
                        size: 20,
                        color: "666666",
                    }),
                ],
                alignment: AlignmentType.LEFT,
                border: {
                    top: {
                        color: BROWN_COLOR,
                        space: 4,
                        style: BorderStyle.SINGLE,
                        size: 2,
                    }
                },
                spacing: { before: 120 },
            }),
        ],
    });

    return { header, footer };
}

// Tool 3: Fill in the Gap
function formatFillGap(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nЗАДАНИЕ:\n`;

    const text = task.task?.text || '';

    if (includeAnswers && task.answers) {
        // Заполняем пропуски ответами
        let filledText = text;
        if (Array.isArray(task.answers)) {
            task.answers.forEach(answer => {
                const match = answer.match(/^(\d+)\s+(.+)$/);
                if (match) {
                    const number = match[1];
                    const correctAnswer = match[2];
                    const pattern = `(${number}) ______`;
                    const replacement = `(${number}) ${correctAnswer}`;
                    filledText = filledText.replace(new RegExp(pattern, 'g'), replacement);
                }
            });
        }
        taskText += `${filledText}\n`;
    } else {
        taskText += `${text}\n`;
    }

    // Банк слов
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

// Tool 17: Interesting Facts
function formatInterestingFacts(task, index, includeAnswers = false) {
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

// Tool 23: Text with Vocabulary
function formatTextWithVocabulary(task, index, includeAnswers = false) {
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

// Tool 19: Matching Halves
function formatMatchingHalves(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nЗАДАНИЕ:\n\n`;

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
        taskText += `ОТВЕТ: ____________________\n`;
    }

    return taskText;
}

// Tool 24: Scramble Sentences
function formatScrambleSentences(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nЗАДАНИЕ: Составьте предложения из слов\n\n`;

    const scrambled = task.task?.scrambled || [];
    scrambled.forEach((sentence, i) => {
        taskText += `${sentence}\n\n`;
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

// Универсальная функция форматирования задания по tool_id
function formatTaskByTool(task, index, includeAnswers = false) {
    const toolId = task.tool_id;

    switch (toolId) {
        case 3: // Fill in the Gap
            return formatFillGap(task, index, includeAnswers);

        case 17: // Interesting Facts
            return formatInterestingFacts(task, index, includeAnswers);

        case 19: // Matching Halves
            return formatMatchingHalves(task, index, includeAnswers);

        case 23: // Text with Vocabulary
            return formatTextWithVocabulary(task, index, includeAnswers);

        case 24: // Scramble Sentences
            return formatScrambleSentences(task, index, includeAnswers);

        default:
            return formatGenericTask(task, index, includeAnswers);
    }
}

// Универсальный формат для неизвестных типов
function formatGenericTask(task, index, includeAnswers = false) {
    let taskText = `\n\nЗАДАНИЕ ${index + 1}`;
    if (task.title) taskText += `: ${task.title}`;
    taskText += `\n${'═'.repeat(50)}\n`;

    if (task.instruction) taskText += `\nИНСТРУКЦИЯ:\n${task.instruction}\n`;

    taskText += `\nЗАДАНИЕ:\n`;
    taskText += `${JSON.stringify(task.task, null, 2)}\n`;

    if (includeAnswers && task.answers) {
        taskText += `\n✅ ОТВЕТЫ:\n`;
        if (Array.isArray(task.answers)) {
            task.answers.forEach(answer => {
                taskText += `   • ${answer}\n`;
            });
        } else {
            taskText += `   ${JSON.stringify(task.answers)}\n`;
        }
    } else if (!includeAnswers) {
        taskText += `\n${'─'.repeat(40)}\n`;
        taskText += `ОТВЕТ: ____________________\n`;
    }

    return taskText;
}

// Генерация текста для документа с заданиями
function generateTasksText(data) {
    let fullText = '';

    // Заголовок группы
    if (data.group_title) {
        fullText += `${data.group_title}\n`;
        fullText += `${'═'.repeat(data.group_title.length)}\n\n`;
    }

    // Задания
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

    // Заголовок группы
    if (data.group_title) {
        fullText += `${data.group_title} - ОТВЕТЫ\n`;
        fullText += `${'═'.repeat(data.group_title.length + 8)}\n\n`;
    }

    // Задания с ответами
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
            line.includes('ЛЕВАЯ ЧАСТЬ:') || line.includes('ПРАВАЯ ЧАСТЬ:')) {
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

        // Ответы с буллетами
        if (line.trim().startsWith('•')) {
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
        if (line.includes('ОТВЕТ: ____________________') && !isAnswers) {
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
            creator: "TUTHELP.ru",
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

// API endpoint
app.post('/api/generate-word', async (req, res) => {
    try {
        console.log('\n📄 НАЧАЛО ГЕНЕРАЦИИ ДВУХ ДОКУМЕНТОВ');
        console.log('='.repeat(60));

        const jsonData = req.body;

        if (!jsonData) {
            return res.status(400).json({
                error: 'Данные не предоставлены',
                message: 'Пожалуйста, отправьте JSON с заданиями'
            });
        }

        console.log(`📋 Группа: ${jsonData.group_title || 'Без названия'}`);
        console.log(`📊 Заданий: ${jsonData.tasks?.length || 0}`);

        // Генерация текста
        const tasksText = generateTasksText(jsonData);
        const answersText = generateAnswersText(jsonData);

        // Генерация документов
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

        // Сохранение
        if (!fs.existsSync('./output')) fs.mkdirSync('./output');

        const timestamp = Date.now();
        fs.writeFileSync(`./output/tasks_${timestamp}.docx`, tasksBuffer);
        fs.writeFileSync(`./output/answers_${timestamp}.docx`, answersBuffer);

        // ZIP
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
        version: '4.1.0',
        features: [
            'Задания не разрываются между страницами',
            'Простая нумерация страниц (1, 2, 3...)',
            'Коричневые заголовки',
            'Два документа: задания и ответы'
        ]
    });
});

// Пример данных
app.get('/api/example-data', (req, res) => {
    const exampleData = {
        "group_title": "Spider-Man Practice",
        "tasks": [
            {
                "tool_id": 23,
                "tool_name": "Create a Text",
                "title": "Text: Spider-Man",
                "instruction": "Read the text",
                "task": {
                    "type": "text-with-vocabulary",
                    "text": "Spider-Man is a superhero from New York. He was bitten by a radioactive spider and gained amazing powers. He can climb walls and has a spider-sense that warns him of danger.",
                    "vocabulary_used": ["superhero", "radioactive", "spider-sense"]
                },
                "answers": null
            },
            {
                "tool_id": 3,
                "tool_name": "Fill in the Gap",
                "title": "Complete the Story",
                "instruction": "Fill in the blanks",
                "task": {
                    "type": "fill-in-the-gap",
                    "text": "Peter Parker was (1) ______ by his Aunt May. He was bitten by a (2) ______ spider. He gained (3) ______ powers.",
                    "wordBank": ["raised", "radioactive", "amazing"]
                },
                "answers": ["1 raised", "2 radioactive", "3 amazing"]
            }
        ]
    };
    res.json(exampleData);
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
                .info { background: #f5f5f5; padding: 20px; border-radius: 10px; }
                .feature { color: #9b6c4b; margin: 5px 0; }
            </style>
        </head>
        <body>
            <h1>📚 TUTHELP PDF Generator v4.1</h1>
            <div class="info">
                <p>✅ Сервер работает</p>
                <p class="feature">✓ Задания не разрываются между страницами</p>
                <p class="feature">✓ Простая нумерация страниц (1, 2, 3...)</p>
                <p class="feature">✓ Коричневые заголовки</p>
                <p class="feature">✓ Два документа: задания и ответы</p>
            </div>
            <button class="btn" onclick="test()">📥 Тестовый запрос</button>
            <script>
                async function test() {
                    const res = await fetch('/api/example-data');
                    const data = await res.json();
                    
                    const response = await fetch('/api/generate-word', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data)
                    });
                    
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'test.zip';
                    a.click();
                }
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.clear();
    console.log('\n' + '='.repeat(60));
    console.log('      ✅ TUTHELP PDF GENERATOR v4.1');
    console.log('='.repeat(60));
    console.log(`   🌐 http://localhost:${PORT}`);
    console.log(`   📡 API: POST /api/generate-word`);
    console.log('='.repeat(60));
    console.log('\n🎯 ОСОБЕННОСТИ:');
    console.log('   • Задания не разрываются между страницами');
    console.log('   • Простая нумерация страниц (1, 2, 3...)');
    console.log('   • Коричневые заголовки');
    console.log('='.repeat(60));
});