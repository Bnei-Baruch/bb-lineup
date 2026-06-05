/** Shared Prisma include/select for slots with lessons — used across API routes */
export const slotWithLessonInclude = {
  lesson: {
    select: {
      id: true,
      sourceRef: true,
      articleSourceRef: true,
      narratorName: true,
      recordingDate: true,
      videoDurationSec: true,
      articleReadingMin: true,
      articleReadingSec: true,
      approvalStatus: true,
      tags: true,
      seriesId: true,
      kmPageLink: true,
      videoLink: true,
      articleSourceLink: true,
      articleSource: {
        select: { bookVolume: true, bookPage: true },
      },
    },
  },
  component: {
    select: {
      id: true,
      name: true,
      category: true,
    },
  },
} as const;
