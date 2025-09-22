require('dotenv').config();
const express = require('express');
const qr = require('qr-image');
const path = require('path');
const db = require('./database/supabase');
const app = express();

// Configurações
const port = process.env.PORT || 3000;
const appName = process.env.APP_NAME || 'Sistema de Votação';
const schoolName = process.env.SCHOOL_NAME || 'Colégio';
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

// Configuração do Express
app.use(express.static('public'));
app.use('/img', express.static('img'));
app.use(express.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware para variáveis globais
app.use((req, res, next) => {
    res.locals.appName = appName;
    res.locals.schoolName = schoolName;
    res.locals.baseUrl = baseUrl;
    res.locals.port = port;
    next();
});

// Função para gerar ID único do votante
const generateVoterId = (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    return require('crypto').createHash('md5').update(ip + userAgent).digest('hex');
};

// ==================== ROTAS ====================

// Rota principal - dashboard
app.get('/', async (req, res) => {
    try {
        const projetos = await db.query(`
            SELECT p.id, p.nome, COUNT(v.id) as total_votos 
            FROM projetos p 
            LEFT JOIN votos v ON p.id = v.projeto_id 
            GROUP BY p.id, p.nome
            ORDER BY total_votos DESC
        `);
        
        res.render('dashboard', { 
            projetos: projetos || [],
            title: 'Dashboard'
        });
    } catch (error) {
        console.error('Erro ao buscar projetos:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Cadastrar projeto
app.post('/cadastrar', async (req, res) => {
    const { nome } = req.body;
    
    if (!nome || nome.trim() === '') {
        return res.status(400).send('Nome do projeto é obrigatório');
    }
    
    try {
        await db.query('INSERT INTO projetos (nome) VALUES ($1)', [nome.trim()]);
        res.redirect('/');
    } catch (error) {
        console.error('Erro ao cadastrar projeto:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Página de votação
app.get('/votar/:id', async (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    try {
        const projetos = await db.query('SELECT id, nome FROM projetos WHERE id = $1', [projetoId]);
        const projeto = projetos[0];
        
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        
        res.render('votar', { 
            projeto,
            title: `Votar em ${projeto.nome}`
        });
    } catch (error) {
        console.error('Erro ao buscar projeto:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Registrar voto
app.post('/votar', async (req, res) => {
    const projetoId = parseInt(req.body.projetoId);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }

    const voterId = generateVoterId(req);
    
    try {
        // Verificar se projeto existe
        const projetos = await db.query('SELECT id, nome FROM projetos WHERE id = $1', [projetoId]);
        const projeto = projetos[0];
        
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        
        // Verificar se já votou
        const votosExistentes = await db.query(
            'SELECT id FROM votos WHERE projeto_id = $1 AND voter_id = $2', 
            [projetoId, voterId]
        );
        
        if (votosExistentes.length > 0) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Voto Já Registrado - ${schoolName}</title>
                    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
                    <style>
                        body { 
                            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                        }
                        .error-box { 
                            max-width: 500px; 
                            margin: 0 auto; 
                            padding: 40px;
                            border-radius: 15px;
                            background: white;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                            text-align: center;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error-box">
                            <div class="mb-4">
                                <span style="font-size: 4rem;">⚠️</span>
                            </div>
                            <h1 class="text-danger mb-3">Voto Já Registrado</h1>
                            <p class="fs-5">Você já votou em <strong>${projeto.nome}</strong></p>
                            <p class="text-muted">${schoolName}</p>
                            <div class="mt-4">
                                <a href="/votar/${projetoId}" class="btn btn-secondary">Voltar</a>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Registrar voto
        await db.query(
            'INSERT INTO votos (projeto_id, voter_id) VALUES ($1, $2)', 
            [projetoId, voterId]
        );
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Voto Registrado - ${schoolName}</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
                <style>
                    body { 
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                    }
                    .success-box { 
                        max-width: 500px; 
                        margin: 0 auto; 
                        padding: 40px;
                        border-radius: 15px;
                        background: white;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-box">
                        <div class="mb-4">
                            <span style="font-size: 4rem;">✅</span>
                        </div>
                        <h1 class="text-success mb-3">Voto Confirmado!</h1>
                        <p class="fs-5">Obrigado por votar em <strong>${projeto.nome}</strong></p>
                        <p class="text-muted">${schoolName}</p>
                        <div class="mt-4">
                            <p class="text-muted small">Você pode fechar esta página</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Erro ao registrar voto:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota para gerar QR Code
app.get('/qrcode/:id', (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    const urlVotacao = `${baseUrl}/votar/${projetoId}`;
    try {
        const qrSvg = qr.imageSync(urlVotacao, { type: 'svg' });
        res.type('image/svg+xml');
        res.send(qrSvg);
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        res.status(500).send('Erro ao gerar QR Code');
    }
});

// Rota para resultados
app.get('/resultados/:id', async (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    try {
        const projetos = await db.query('SELECT id, nome FROM projetos WHERE id = $1', [projetoId]);
        const projeto = projetos[0];
        
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        
        const resultados = await db.query('SELECT COUNT(*) AS total_votos FROM votos WHERE projeto_id = $1', [projetoId]);
        const totalVotos = parseInt(resultados[0].total_votos);
        
        res.render('resultados', { 
            projeto, 
            totalVotos 
        });
    } catch (error) {
        console.error('Erro ao buscar resultados:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota para relatório
app.get('/relatorio', async (req, res) => {
    try {
        const projetos = await db.query(`
            SELECT p.id, p.nome, COUNT(v.id) as total_votos 
            FROM projetos p 
            LEFT JOIN votos v ON p.id = v.projeto_id 
            GROUP BY p.id, p.nome
            ORDER BY total_votos DESC
        `);
        
        const totalGeral = projetos.reduce((sum, p) => sum + (parseInt(p.total_votos) || 0), 0);
        
        let projetoMaisVotado = null;
        if (projetos.length > 0) {
            const projetosComVotos = projetos.filter(p => parseInt(p.total_votos) > 0);
            projetoMaisVotado = projetosComVotos.length > 0 ? projetosComVotos[0] : null;
        }
        
        res.render('relatorio', { 
            projetos, 
            projetoMaisVotado,
            totalGeral
        });
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota para imprimir seleção
app.get('/imprimir', async (req, res) => {
    try {
        const projetos = await db.query(`
            SELECT p.id, p.nome, COUNT(v.id) as total_votos 
            FROM projetos p 
            LEFT JOIN votos v ON p.id = v.projeto_id 
            GROUP BY p.id, p.nome
            ORDER BY p.nome ASC
        `);
        
        res.render('selecionar-imprimir', { 
            projetos,
            title: 'Selecionar Projeto para Imprimir'
        });
    } catch (error) {
        console.error('Erro ao buscar projetos:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota para página de impressão específica
app.get('/imprimir/:id', async (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    try {
        const projetos = await db.query('SELECT id, nome FROM projetos WHERE id = $1', [projetoId]);
        const projeto = projetos[0];
        
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        
        res.render('imprimir', { 
            projeto,
            title: `Imprimir QR Code - ${projeto.nome}`
        });
    } catch (error) {
        console.error('Erro ao buscar projeto:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Health check
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ 
            status: 'OK', 
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            database: 'Disconnected',
            error: error.message 
        });
    }
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
    console.log(`📊 ${appName}`);
    console.log(`🏫 ${schoolName}`);
    console.log(`🗄️  Banco: Supabase PostgreSQL`);
    console.log(`🌐 Acesse: ${baseUrl}`);
});