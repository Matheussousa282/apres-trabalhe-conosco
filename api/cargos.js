import { Pool } from "pg";
import { obterAcesso, filtroCargos } from "./_acesso.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    const { method } = req;

    // Sem token = formulário público (lista completa). Com token: gerente com
    // cargos restritos só enxerga os seus cargos e nenhum usuário restrito edita cargos.
    const acesso = await obterAcesso(pool, req);
    if (acesso && (!acesso.total || !acesso.todosCargos) && method !== "GET") {
      return res.status(403).json({ error: "Sem permissão" });
    }

    // LISTAR
    // Formulário público (sem token) ou ?ativo=true: somente ativos.
    // Telas de gestão (com token): todos, para permitir reativar.
    if (method === "GET") {
      const filtroCargo = acesso ? filtroCargos(acesso) : null;
      const somenteAtivos = !acesso || req.query.ativo === "true";

      const result = await pool.query(
        `SELECT id, nome, ativo FROM cargos
         WHERE ($1::int[] IS NULL OR id = ANY($1::int[]))
           AND ($2::boolean = false OR ativo = true)
         ORDER BY nome`,
        [filtroCargo, somenteAtivos]
      );
      return res.status(200).json(result.rows);
    }

    // CRIAR
    if (method === "POST") {
      const { nome } = req.body;

      if (!nome) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      await pool.query(
        "INSERT INTO cargos (nome) VALUES ($1)",
        [nome]
      );

      return res.status(201).json({ success: true });
    }

    // EDITAR
    if (method === "PUT") {
      const { id, nome, ativo } = req.body;

      await pool.query(
        "UPDATE cargos SET nome = $1, ativo = $2 WHERE id = $3",
        [nome, ativo, id]
      );

      return res.json({ success: true });
    }

    // INATIVAR
    if (method === "DELETE") {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: "ID obrigatório" });
      }

      await pool.query(
        "UPDATE cargos SET ativo = false WHERE id = $1",
        [id]
      );

      return res.json({ success: true });
    }

    return res.status(405).json({ error: "Método não permitido" });

  } catch (error) {
    console.error("ERRO API CARGOS:", error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      details: error.message
    });
  }
}
