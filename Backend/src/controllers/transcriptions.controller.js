import { AppError } from '../middleware/errorHandler.js';
import * as transcriptionsService from '../services/transcriptions.service.js';

export async function create(req, res, next) {
  try {
    const row = await transcriptionsService.createTranscription(req.validated.body);
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { page, limit, q, sort, order } = req.validated.query;
    const { rows, total } = await transcriptionsService.listTranscriptions({
      page,
      limit,
      q,
      sort,
      order,
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const { id } = req.validated.params;
    const row = await transcriptionsService.getTranscriptionById(id);

    if (!row) {
      throw new AppError(404, `Transcription with id ${id} not found.`);
    }

    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { id } = req.validated.params;
    const row = await transcriptionsService.updateTranscription(id, req.validated.body);

    if (!row) {
      throw new AppError(404, `Transcription with id ${id} not found.`);
    }

    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { id } = req.validated.params;
    const deleted = await transcriptionsService.deleteTranscription(id);

    if (!deleted) {
      throw new AppError(404, `Transcription with id ${id} not found.`);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
