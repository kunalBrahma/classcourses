import { Router } from "express";
import { validateBody } from "../middleware/validate.middleware";
import {
  bulkCreateChapters,
  createChapter,
  createClassLevel,
  createMedium,
  deleteClassLevel,
  reorderClassLevels,
  createPart,
  createSubject,
  deleteChapter,
  deleteMedium,
  deletePart,
  deleteSubject,
  getSubjectAdmin,
  listClassLevelsAdmin,
  listMediumsAdmin,
  listSubjectsAdmin,
  reorderChapters,
  reorderMediums,
  reorderParts,
  reorderSubjects,
  updateChapter,
  updateClassLevel,
  updateMedium,
  updatePart,
  updateSubject,
} from "../controllers/adminCatalog.controller";
import {
  bulkCreateChaptersSchema,
  createChapterSchema,
  createMediumSchema,
  createPartSchema,
  createSubjectSchema,
  reorderChaptersSchema,
  reorderSchema,
  updateChapterSchema,
  updateClassLevelSchema,
  updateMediumSchema,
  updatePartSchema,
  updateSubjectSchema,
  createClassLevelSchema,
} from "../validations/catalog.validation";

// Mounted inside admin.routes.ts, which already enforces authenticate + ADMIN.
const router = Router();

// Mediums
router.get("/mediums", listMediumsAdmin);
router.post("/mediums", validateBody(createMediumSchema), createMedium);
router.put("/mediums/reorder", validateBody(reorderSchema), reorderMediums);
router.patch("/mediums/:id", validateBody(updateMediumSchema), updateMedium);
router.delete("/mediums/:id", deleteMedium);

// Classes
router.get("/classes", listClassLevelsAdmin);
router.post("/classes", validateBody(createClassLevelSchema), createClassLevel);
router.put("/classes/reorder", validateBody(reorderSchema), reorderClassLevels);
router.patch("/classes/:id", validateBody(updateClassLevelSchema), updateClassLevel);
router.delete("/classes/:id", deleteClassLevel);

// Subjects
router.get("/subjects", listSubjectsAdmin);
router.post("/subjects", validateBody(createSubjectSchema), createSubject);
router.put("/subjects/reorder", validateBody(reorderSchema), reorderSubjects);
router.get("/subjects/:id", getSubjectAdmin);
router.patch("/subjects/:id", validateBody(updateSubjectSchema), updateSubject);
router.delete("/subjects/:id", deleteSubject);

// Parts
router.post("/subjects/:id/parts", validateBody(createPartSchema), createPart);
router.put("/subjects/:id/parts/reorder", validateBody(reorderSchema), reorderParts);
router.patch("/parts/:partId", validateBody(updatePartSchema), updatePart);
router.delete("/parts/:partId", deletePart);

// Chapters
router.post("/subjects/:id/chapters", validateBody(createChapterSchema), createChapter);
router.post("/subjects/:id/chapters/bulk", validateBody(bulkCreateChaptersSchema), bulkCreateChapters);
router.put("/subjects/:id/chapters/reorder", validateBody(reorderChaptersSchema), reorderChapters);
router.patch("/chapters/:chapterId", validateBody(updateChapterSchema), updateChapter);
router.delete("/chapters/:chapterId", deleteChapter);

export default router;
