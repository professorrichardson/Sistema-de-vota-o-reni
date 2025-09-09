const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const qr = require('qr-image');
const path = require('path');
const app = express();
const port = 3000;

// Configuração do banco de dados SQLite
const db = new sqlite3.Database('./votacao.db');

// Cria a tabela de projetos e votos se elas não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS votos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER,
        FOREIGN KEY (projeto_id) REFERENCES projetos (id)
    )`);
});

// Configuração do Express para usar EJS
app.use(express.static('public')); // Se você tiver arquivos estáticos como CSS, coloque-os na pasta 'public'
app.use(express.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Rota para o dashboard (página principal)
app.get('/', (req, res) => {
    db.all('SELECT id, nome FROM projetos', (err, projetos) => {
        if (err) {
            console.error('Erro ao buscar projetos:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        res.render('dashboard', { projetos });
    });
});

// Rota para cadastrar um novo projeto
app.post('/cadastrar', (req, res) => {
    const { nome } = req.body;
    db.run('INSERT INTO projetos (nome) VALUES (?)', [nome], function(err) {
        if (err) {
            console.error('Erro ao cadastrar projeto:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        res.redirect('/');
    });
});

// Rota para a página de votação (acessada via QR Code)
app.get('/votar/:id', (req, res) => {
    const projetoId = req.params.id;
    db.get('SELECT nome FROM projetos WHERE id = ?', [projetoId], (err, projeto) => {
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

// Rota para registrar o voto
app.post('/votar', (req, res) => {
    const { projetoId } = req.body;
    db.run('INSERT INTO votos (projeto_id) VALUES (?)', [projetoId], function(err) {
        if (err) {
            console.error('Erro ao registrar voto:', err.message);
            return res.status(500).send('Erro interno do servidor');
        }
        res.send('Obrigado! Seu voto foi registrado com sucesso.');
    });
});

// Rota para gerar o QR Code
app.get('/qrcode/:id', (req, res) => {
    const urlVotacao = `http://localhost:${port}/votar/${req.params.id}`;
    const qrSvg = qr.imageSync(urlVotacao, { type: 'svg' });
    res.type('image/svg+xml');
    res.send(qrSvg);
});

// Rota para exibir os resultados da votação
app.get('/resultados/:id', (req, res) => {
    const projetoId = req.params.id;
    db.get('SELECT nome FROM projetos WHERE id = ?', [projetoId], (err, projeto) => {
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
            res.render('resultados', { projeto, totalVotos: resultado.total_votos });
        });
    });
});


app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});