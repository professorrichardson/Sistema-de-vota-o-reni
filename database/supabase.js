const { Pool } = require('pg');

class Database {
    constructor() {
        this.pool = null;
        this.init();
    }

    async init() {
        try {
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            });

            // Testar conexão
            await this.pool.query('SELECT 1');
            console.log('✅ Conectado ao Supabase PostgreSQL');
            
            await this.criarTabelas();
        } catch (error) {
            console.error('❌ Erro ao conectar com Supabase:', error);
            // Tenta reconectar
            setTimeout(() => this.init(), 5000);
        }
    }

    async criarTabelas() {
        try {
            // Tabela de projetos
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS projetos (
                    id SERIAL PRIMARY KEY,
                    nome VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Tabela de votos
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS votos (
                    id SERIAL PRIMARY KEY,
                    projeto_id INTEGER NOT NULL,
                    voter_id VARCHAR(255) NOT NULL,
                    data_voto TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
                )
            `);

            // Índice para busca rápida
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_votos_voter_projeto 
                ON votos (voter_id, projeto_id)
            `);

            console.log('✅ Tabelas PostgreSQL criadas/verificadas');
        } catch (error) {
            console.error('Erro ao criar tabelas:', error);
        }
    }

    async query(sql, params = []) {
        try {
            const result = await this.pool.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('Erro na query:', error);
            throw error;
        }
    }

    // Método para INSERT que retorna o ID
    async insert(sql, params = []) {
        try {
            const result = await this.pool.query(sql + ' RETURNING id', params);
            return result.rows[0].id;
        } catch (error) {
            console.error('Erro no insert:', error);
            throw error;
        }
    }
}

module.exports = new Database();