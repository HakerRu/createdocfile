const express = require('express');
const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, ImageRun, BorderStyle } = require('docx');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' })); // Увеличил лимит для больших текстов

// Константы
const CHARS_PER_PAGE = 2000; // Количество символов на страницу

// Разделяем текст на страницы
function splitTextIntoPages(text) {
    if (!text || text.length === 0) return [];

    const pages = [];
    let remainingText = text;
    let pageCount = 0;

    console.log('📄 Разбиение текста на страницы...');

    while (remainingText.length > 0) {
        pageCount++;

        if (remainingText.length <= CHARS_PER_PAGE) {
            pages.push(remainingText);
            console.log(`   Страница ${pageCount}: ${remainingText.length} символов`);
            break;
        }

        // Ищем хорошее место для разрыва
        let chunk = remainingText.substring(0, CHARS_PER_PAGE);
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

        const pageText = remainingText.substring(0, splitPoint).trim();
        pages.push(pageText);
        console.log(`   Страница ${pageCount}: ${pageText.length} символов`);

        remainingText = remainingText.substring(splitPoint).trim();
    }

    console.log(`✅ Всего создано страниц: ${pages.length}`);
    return pages;
}

// Функция для создания колонтитулов
function createHeaderAndFooter(pageNumber, totalPages) {
    // Верхний колонтитул - ЛОГОТИП СЛЕВА
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
                        color: "9b6c4b",
                        space: 4,
                        style: BorderStyle.SINGLE,
                        size: 2,
                    }
                }
            }),
        ],
    });

    // Нижний колонтитул
    const footer = new Footer({
        children: [
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${pageNumber}`,
                        bold: true,
                        size: 24,
                    }),
                    new TextRun({
                        text: `\t\t\t\t\t\t\t\tДокумент создан с помощью платформы TUTHELP.ru`,
                        bold: false,
                        size: 20,
                        color: "666666",
                    }),
                ],
                alignment: AlignmentType.LEFT,
                border: {
                    top: {
                        color: "9b6c4b",
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

// Преобразование текста в параграфы Word
function textToParagraphs(text) {
    if (!text) return [new Paragraph({ children: [new TextRun("")] })];

    return text.split('\n').map(line => {
        if (line.trim() === '---') {
            return new Paragraph({
                children: [new TextRun({
                    text: '───────────────────────────────────────',
                    bold: true,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 300, after: 300 },
            });
        }

        if (line.includes('LESSON') || line.includes('═══════════════')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 32,
                    color: "1F4E8C",
                })],
                spacing: { before: 400, after: 200 },
                alignment: AlignmentType.CENTER,
            });
        }

        if (line.includes('EXERCISE')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 28,
                    color: "2E75B6",
                })],
                spacing: { before: 300, after: 150 },
            });
        }

        if (line.match(/^\d+\./)) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                })],
                indent: { left: 360 },
                spacing: { before: 60, after: 40 },
            });
        }

        if (line.trim().startsWith('   ')) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    italics: true,
                    size: 22,
                    color: "5A5A5A",
                })],
                indent: { left: 720 },
                spacing: { before: 20, after: 20 },
            });
        }

        if (line.trim()) {
            return new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 24,
                })],
                spacing: { before: 80, after: 80 },
            });
        }

        return new Paragraph({
            children: [new TextRun("")],
        });
    });
}

// Генерация Word документа из текста
async function generateWordDocument(text, metadata = {}) {
    console.log('\n📝 Создание документа из полученного текста...');

    const pages = splitTextIntoPages(text);
    const totalPages = pages.length;

    const sections = pages.map((pageText, index) => {
        const pageNumber = index + 1;
        console.log(`   Создание страницы ${pageNumber} из ${totalPages}...`);

        const { header, footer } = createHeaderAndFooter(pageNumber, totalPages);
        const paragraphs = textToParagraphs(pageText);

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
            title: metadata.title || "TUTHELP Учебные материалы",
            subject: metadata.subject || "Английский язык",
            creator: "TUTHELP.ru",
            description: metadata.description || "Учебные материалы по английскому языку",
        },
    });

    return await Packer.toBuffer(doc);
}

// API endpoint для генерации документа из JSON
app.post('/api/generate-word', async (req, res) => {
    try {
        console.log('\n📄 НАЧАЛО ГЕНЕРАЦИИ ДОКУМЕНТА ИЗ JSON');
        console.log('='.repeat(60));

        const { text, metadata, filename } = req.body;

        // Проверка наличия текста
        if (!text) {
            return res.status(400).json({
                error: 'Текст не предоставлен',
                message: 'Пожалуйста, укажите текст в поле "text"'
            });
        }

        console.log(`📊 Получен текст длиной: ${text.length} символов`);
        if (metadata) {
            console.log(`📋 Метаданные:`, metadata);
        }

        // Генерация документа
        const buffer = await generateWordDocument(text, metadata);

        // Создание папок если нужно
        if (!fs.existsSync('./output')) fs.mkdirSync('./output');
        if (!fs.existsSync('./templates')) fs.mkdirSync('./templates');

        // Сохранение файла
        const outputFilename = filename || `tuthelp_${Date.now()}.docx`;
        const outputPath = path.join(__dirname, 'output', outputFilename);
        fs.writeFileSync(outputPath, buffer);

        console.log('='.repeat(60));
        console.log(`✅ Документ сохранен: ${outputPath}`);
        console.log('='.repeat(60));

        // Отправка файла
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=${outputFilename}`);
        res.send(buffer);

    } catch (error) {
        console.error('❌ ОШИБКА:', error);
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// API endpoint для получения информации
app.get('/api/info', (req, res) => {
    const hasLogo = fs.existsSync('./templates/logo.png');

    res.json({
        status: 'online',
        service: 'TUTHELP Word Generator',
        version: '1.0.0',
        settings: {
            charsPerPage: CHARS_PER_PAGE,
            hasLogo: hasLogo,
            borderColor: '#9b6c4b'
        },
        endpoints: {
            generate: '/api/generate-word (POST)',
            info: '/api/info (GET)'
        }
    });
});

// Тестовый endpoint для генерации примера
app.post('/api/generate-example', async (req, res) => {
    try {
        // Генерация примера текста
        const exampleText = `
LESSON 1: Present Simple vs Present Continuous
═══════════════════════════════════════════

Grammar Explanation:
This section focuses on present simple vs present continuous. Complete the following exercises to practice this grammar point.

EXERCISE A: Multiple Choice
1. ______ to the party tonight?
   a) Do you go
   b) Are you going
   c) Have you gone
   d) Will you go

2. She ______ coffee every morning.
   a) drink
   b) drinks
   c) is drinking
   d) has drunk

EXERCISE B: Fill in the Blanks
1. Look! It __________ (rain) outside.
    Answer: ____________________

2. Water __________ (boil) at 100 degrees Celsius.
    Answer: ____________________

---
        `;

        const buffer = await generateWordDocument(exampleText, {
            title: "Пример учебных материалов",
            subject: "Английский язык"
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=tuthelp_example.docx');
        res.send(buffer);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Главная страница с формой для тестирования
app.get('/', (req, res) => {
    const hasLogo = fs.existsSync('./templates/logo.png');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TUTHELP Word Генератор API</title>
            <style>
                body { font-family: 'Segoe UI', Arial; max-width: 1000px; margin: 40px auto; padding: 20px; }
                h1 { color: #1F4E8C; }
                h2 { color: #2E75B6; margin-top: 30px; }
                .btn { 
                    padding: 12px 30px; 
                    background: #1F4E8C; 
                    color: white; 
                    border: none; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    font-size: 16px;
                    margin: 5px;
                }
                .btn:hover { background: #2E75B6; }
                .btn-secondary { background: #9b6c4b; }
                .btn-secondary:hover { background: #7b5a3e; }
                .success { color: green; }
                .warning { color: orange; }
                .stats { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0; }
                textarea { 
                    width: 100%; 
                    height: 200px; 
                    padding: 10px; 
                    font-family: monospace;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                }
                input { 
                    width: 100%; 
                    padding: 8px; 
                    margin: 5px 0 15px 0;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                }
                .code-block {
                    background: #2d2d2d;
                    color: #f8f8f8;
                    padding: 15px;
                    border-radius: 5px;
                    font-family: monospace;
                    overflow-x: auto;
                }
                .endpoint {
                    background: #e3f2fd;
                    padding: 10px;
                    border-left: 4px solid #1F4E8C;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <h1>📚 TUTHELP.ru - Генератор Word документов API</h1>
            <p class="success">✅ Сервер работает</p>
            
            <div class="stats">
                <h3>📊 Информация:</h3>
                <p>📄 Символов на страницу: <strong>${CHARS_PER_PAGE}</strong></p>
                <p>🖼️ Логотип: ${hasLogo ? '✅ Есть' : '❌ Отсутствует'}</p>
                <p>🔗 API Endpoints:</p>
                <ul>
                    <li><strong>POST</strong> /api/generate-word - Основной генератор</li>
                    <li><strong>GET</strong> /api/info - Информация о сервере</li>
                    <li><strong>POST</strong> /api/generate-example - Сгенерировать пример</li>
                </ul>
            </div>

            <h2>📝 Тестовая форма</h2>
            <div class="endpoint">
                <strong>POST /api/generate-word</strong> - Отправьте JSON с текстом
            </div>
            
            <form id="generateForm">
                <h3>Метаданные (опционально):</h3>
                <label>Название документа:</label>
                <input type="text" id="title" placeholder="TUTHELP Учебные материалы">
                
                <label>Тема:</label>
                <input type="text" id="subject" placeholder="Английский язык">
                
                <label>Имя файла:</label>
                <input type="text" id="filename" placeholder="tuthelp_materials.docx">
                
                <h3>Текст документа:</h3>
                <textarea id="text" placeholder="Введите текст документа...">LESSON 1: Present Simple vs Present Continuous
═══════════════════════════════════════════

Grammar Explanation:
This section focuses on present simple vs present continuous.

EXERCISE A: Multiple Choice
1. She ______ coffee every morning.
   a) drink
   b) drinks
   c) is drinking
   d) has drunk

EXERCISE B: Fill in the Blanks
1. Look! It __________ (rain) outside.
    Answer: ____________________</textarea>
                
                <button type="submit" class="btn">📥 СГЕНЕРИРОВАТЬ</button>
                <button type="button" class="btn btn-secondary" onclick="generateExample()">📋 СГЕНЕРИРОВАТЬ ПРИМЕР</button>
            </form>

            <h2>📦 Пример JSON запроса:</h2>
            <div class="code-block">
{
  "text": "Текст вашего документа...",
  "metadata": {
    "title": "Название документа",
    "subject": "Тема",
    "description": "Описание"
  },
  "filename": "custom_filename.docx"
}
            </div>

            <script>
                document.getElementById('generateForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const btn = document.querySelector('.btn');
                    btn.textContent = '⏳ Генерация...';
                    btn.disabled = true;
                    
                    try {
                        const response = await fetch('/api/generate-word', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                text: document.getElementById('text').value,
                                metadata: {
                                    title: document.getElementById('title').value,
                                    subject: document.getElementById('subject').value
                                },
                                filename: document.getElementById('filename').value || undefined
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error('Ошибка сервера');
                        }
                        
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = document.getElementById('filename').value || 'tuthelp_document.docx';
                        a.click();
                        
                        btn.textContent = '✅ ГОТОВО! Сгенерировать ещё';
                    } catch (error) {
                        alert('Ошибка: ' + error.message);
                        btn.textContent = '📥 СГЕНЕРИРОВАТЬ';
                    } finally {
                        btn.disabled = false;
                    }
                });

                async function generateExample() {
                    const btn = document.querySelector('.btn-secondary');
                    btn.textContent = '⏳ Генерация...';
                    btn.disabled = true;
                    
                    try {
                        const response = await fetch('/api/generate-example', { method: 'POST' });
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'tuthelp_example.docx';
                        a.click();
                    } catch (error) {
                        alert('Ошибка: ' + error.message);
                    } finally {
                        btn.textContent = '📋 СГЕНЕРИРОВАТЬ ПРИМЕР';
                        btn.disabled = false;
                    }
                }
            </script>
            
            <div style="margin-top: 50px; padding-top: 20px; border-top: 2px solid #9b6c4b; text-align: center; color: #666;">
                Документ создан с помощью платформы TUTHELP.ru
            </div>
        </body>
        </html>
    `);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.clear();
    console.log('\n' + '='.repeat(60));
    console.log('              ✅ TUTHELP ГЕНЕРАТОР ЗАПУЩЕН');
    console.log('='.repeat(60));
    console.log(`   🌐 http://localhost:${PORT}`);
    console.log(`   📡 API: http://localhost:${PORT}/api`);
    console.log('='.repeat(60));
    console.log('\n📡 ДОСТУПНЫЕ ENDPOINTS:');
    console.log('   POST /api/generate-word - Основной генератор');
    console.log('   GET  /api/info         - Информация о сервере');
    console.log('   POST /api/generate-example - Пример документа');
    console.log('='.repeat(60));
});