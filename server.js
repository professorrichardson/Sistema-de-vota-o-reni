require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const qr = require('qr-image');
const path = require('path');
const app = express();

// Configurações do ambiente (apenas as que você definiu)
const port = process.env.PORT || 3000;
const appName = process.env.APP_NAME || 'Sistema de Votação';
const schoolName = process.env.SCHOOL_NAME || 'Colégio';
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const dbPath = process.env.DB_PATH || './votacao.db';

console.log('🔧 Configurações carregadas:');
console.log(`   Porta: ${port}`);
console.log(`   Nome do App: ${appName}`);
console.log(`   Colégio: ${schoolName}`);
console.log(`   URL Base: ${baseUrl}`);

// Configuração do banco de dados SQLite
const db = new sqlite3.Database(dbPath);

// Cria as tabelas se não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS votos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER,
        voter_id TEXT NOT NULL,
        data_voto DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projeto_id) REFERENCES projetos (id)
    )`);
});


// Configuração do Express
app.use(express.static('public'));
app.use('/img', express.static('img'));
app.use(express.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware para passar variáveis para todas as views
app.use((req, res, next) => {
    res.locals.appName = appName;
    res.locals.schoolName = schoolName;
    res.locals.baseUrl = baseUrl;
    res.locals.port = port;
    next();
});

// Função para gerar ID único do votante baseado no IP + user agent
const generateVoterId = (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    return require('crypto').createHash('md5').update(ip + userAgent).digest('hex');
};

// Rota principal - dashboard (APENAS PARA ADMIN)
app.get('/', (req, res) => {
    const sql = `
        SELECT p.id, p.nome, COUNT(v.id) as total_votos 
        FROM projetos p 
        LEFT JOIN votos v ON p.id = v.projeto_id 
        GROUP BY p.id, p.nome
        ORDER BY total_votos DESC
    `;
    
    db.all(sql, (err, projetos) => {
        if (err) {
            console.error('Erro ao buscar projetos:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        res.render('dashboard', { projetos });
    });
});

// Rota para cadastrar projeto
app.post('/cadastrar', (req, res) => {
    const { nome } = req.body;
    if (!nome || nome.trim() === '') {
        return res.status(400).send('Nome do projeto é obrigatório');
    }
    
    db.run('INSERT INTO projetos (nome) VALUES (?)', [nome.trim()], function(err) {
        if (err) {
            console.error('Erro ao cadastrar projeto:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        res.redirect('/');
    });
});

// Rota para votação (PÚBLICA - sem acesso ao dashboard)
app.get('/votar/:id', (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    db.get('SELECT id, nome FROM projetos WHERE id = ?', [projetoId], (err, projeto) => {
        if (err) {
            console.error('Erro ao buscar projeto para votação:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        res.render('votar', { projeto });
    });
});

// Rota para registrar voto (COM CONTROLE DE VOTO ÚNICO)
app.post('/votar', (req, res) => {
    const projetoId = parseInt(req.body.projetoId);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }

    // Gera um ID único para o votante baseado no IP + user agent
    const voterId = generateVoterId(req);
    
    // Verifica se o projeto existe
    db.get('SELECT id, nome FROM projetos WHERE id = ?', [projetoId], (err, projeto) => {
        if (err) {
            console.error('Erro ao verificar projeto:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        
        // VERIFICA SE ESTE VOTANTE JÁ VOTOU NESTE PROJETO
        db.get('SELECT id FROM votos WHERE projeto_id = ? AND voter_id = ?', [projetoId, voterId], (err, votoExistente) => {
            if (err) {
                console.error('Erro ao verificar voto existente:', err.message);
                return res.status(500).send('Erro interno do servidor');
            }
            
            if (votoExistente) {
                // Já votou neste projeto - mostra mensagem de erro
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Voto Já Registrado</title>
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
                                <p class="text-muted">Cada pessoa pode votar apenas uma vez por projeto.</p>
                                <div class="mt-4">
                                    <a href="/votar/${projetoId}" class="btn btn-secondary">Voltar</a>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            // Registra o voto (primeiro voto deste usuário neste projeto)
            db.run('INSERT INTO votos (projeto_id, voter_id) VALUES (?, ?)', [projetoId, voterId], function(err) {
                if (err) {
                    console.error('Erro ao registrar voto:', err.message);
                    return res.status(500).send('Erro interno do servidor');
                }
                
                // Página de confirmação SIMPLES sem links para o dashboard
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Voto Registrado</title>
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
                                <p class="text-muted">Seu voto foi registrado com sucesso.</p>
                                <div class="mt-4">
                                    <p class="text-muted small">Você pode fechar esta página</p>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `);
            });
        });
    });
});

// Rota para gerar QR Code
app.get('/qrcode/:id', (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    const urlVotacao = `${baseUrl}/votar/${projetoId}`; // ← Usa baseUrl aqui
    try {
        const qrSvg = qr.imageSync(urlVotacao, { type: 'svg' });
        res.type('image/svg+xml');
        res.send(qrSvg);
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        res.status(500).send('Erro ao gerar QR Code');
    }
});


// Rota para selecionar qual projeto imprimir (LISTA TODOS OS PROJETOS)
app.get('/imprimir', (req, res) => {
    const sql = `
        SELECT p.id, p.nome, COUNT(v.id) as total_votos 
        FROM projetos p 
        LEFT JOIN votos v ON p.id = v.projeto_id 
        GROUP BY p.id, p.nome
        ORDER BY p.nome ASC
    `;
    
    db.all(sql, (err, projetos) => {
        if (err) {
            console.error('Erro ao buscar projetos:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        res.render('selecionar-imprimir', { 
            projetos,
            title: 'Selecionar Projeto para Imprimir'
        });
    });
});

// Rota para página de impressão específica
app.get('/imprimir/:id', (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    db.get('SELECT id, nome FROM projetos WHERE id = ?', [projetoId], (err, projeto) => {
        if (err) {
            console.error('Erro ao buscar projeto:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        res.render('imprimir', { 
            projeto, 
            port 
        });
    });
});

// Rota para resultados individuais
app.get('/resultados/:id', (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    db.get('SELECT id, nome FROM projetos WHERE id = ?', [projetoId], (err, projeto) => {
        if (err) {
            console.error('Erro ao buscar projeto para resultados:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        if (!projeto) {
            return res.status(404).send('Projeto não encontrado.');
        }
        
        db.get('SELECT COUNT(*) AS total_votos FROM votos WHERE projeto_id = ?', [projetoId], (err, resultado) => {
            if (err) {
                console.error('Erro ao contar votos:', err.message);
                return res.status(500).send('Erro interno do servidor');
            }
            res.render('resultados', { 
                projeto, 
                totalVotos: resultado.total_votos 
            });
        });
    });
});

// Rota para relatório geral
app.get('/relatorio', (req, res) => {
    const sql = `
        SELECT p.id, p.nome, COUNT(v.id) as total_votos 
        FROM projetos p 
        LEFT JOIN votos v ON p.id = v.projeto_id 
        GROUP BY p.id, p.nome
        ORDER BY total_votos DESC, p.nome ASC
    `;
    
    db.all(sql, (err, projetos) => {
        if (err) {
            console.error('Erro ao gerar relatório:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        
        // CORREÇÃO: Garantir que total_votos seja número
        projetos.forEach(projeto => {
            projeto.total_votos = parseInt(projeto.total_votos) || 0;
        });
        
        const totalGeral = projetos.reduce((sum, p) => sum + p.total_votos, 0);
        
        let projetoMaisVotado = null;
        if (projetos.length > 0) {
            const projetosComVotos = projetos.filter(p => p.total_votos > 0);
            projetoMaisVotado = projetosComVotos.length > 0 ? projetosComVotos[0] : null;
        }
        
        res.render('relatorio', { 
            projetos, 
            projetoMaisVotado,
            totalGeral
        });
    });
});

// Rota para limpar todos os votos (útil para testes)
app.post('/limpar-votos', (req, res) => {
    db.run('DELETE FROM votos', function(err) {
        if (err) {
            console.error('Erro ao limpar votos:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        console.log('Todos os votos foram limpos');
        res.redirect('/');
    });
});

// Rota para excluir projeto
app.post('/excluir/:id', (req, res) => {
    const projetoId = parseInt(req.params.id);
    
    if (isNaN(projetoId)) {
        return res.status(400).send('ID do projeto inválido');
    }
    
    db.run('DELETE FROM votos WHERE projeto_id = ?', [projetoId], function(err) {
        if (err) {
            console.error('Erro ao excluir votos:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        
        db.run('DELETE FROM projetos WHERE id = ?', [projetoId], function(err) {
            if (err) {
                console.error('Erro ao excluir projeto:', err.message);
                return res.status(500).send('Erro interno do servidor');
            }
            res.redirect('/');
        });
    });
});

// Rota 404
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Página Não Encontrada</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
        </head>
        <body>
            <div class="container text-center mt-5">
                <h1>404 - Página Não Encontrada</h1>
                <a href="/" class="btn btn-primary">Voltar ao Início</a>
            </div>
        </body>
        </html>
    `);
});

// Inicialização do servidor
app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
    console.log('📊 Sistema de Votação iniciado com sucesso!');
    console.log('✅ Controle de votos único por pessoa ativado');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando servidor...');
    db.close((err) => {
        if (err) {
            console.error('Erro ao fechar banco de dados:', err.message);
        }
        process.exit(0);
    });
});