import { describe, expect, it } from 'vitest'
import { builtInChapterReference, parseTextbookChapters } from '../src/client/chapter-index.ts'

describe('textbook chapter index', () => {
  it('turns the compact Chinese catalog into stable chapter entries', () => {
    const chapters = parseTextbookChapters({
      id: 'book', subject: 'chinese', grade: '七年级', term: '上册', publisher: '人民教育出版社', edition: '统编版', volume: '上册', title: '七上语文',
      chapterIndex: '第一单元：1 春；2 济南的冬天；古代诗歌四首',
    })
    expect(chapters).toHaveLength(3)
    expect(chapters[0]).toMatchObject({ title: '春', lessonNumber: '1', unitTitle: '第一单元', textbookProfileId: 'book' })
    expect(chapters[0]?.id).toBe('book::%E7%AC%AC%E4%B8%80%E5%8D%95%E5%85%83::%E6%98%A5')
  })

  it('returns no entries when a profile has no chapter index', () => {
    expect(parseTextbookChapters({
      id: 'book', subject: 'math', grade: '七年级', term: '上册', publisher: '出版社', edition: '版本', volume: '上册', title: '数学',
    })).toEqual([])
  })

  it('provides a concrete preview for every Chinese chapter in the preset catalog', () => {
    const chapters = parseTextbookChapters({
      id: 'book', subject: 'chinese', grade: '七年级', term: '上册', publisher: '人民教育出版社', edition: '统编版', volume: '上册', title: '七上语文',
      chapterIndex: '第一单元：1 春；2 济南的冬天；3 雨的四季；古代诗歌四首\n第二单元：5 秋天的怀念；6 散步；7 散文诗二首；8《世说新语》二则\n第三单元：9 从百草园到三味书屋；10 往事依依；11 再塑生命的人；12《论语》十二章\n第四单元：13 纪念白求恩；14 回忆我的母亲；15 梅岭三章；16 诫子书\n第五单元：17 猫；18 我的白鸽；19 大雁归来；20 狼\n第六单元：21 小圣施威降大圣；22 皇帝的新装；23 女娲造人；24 寓言四则',
    })
    expect(chapters).toHaveLength(24)
    for (const chapter of chapters) {
      expect(builtInChapterReference(chapter)).toMatchObject({
        overview: expect.any(String),
        summary: expect.any(String),
        structure: expect.arrayContaining([expect.objectContaining({ title: expect.any(String), body: expect.any(String) })]),
        themes: expect.arrayContaining([expect.any(String)]),
        keyWords: expect.arrayContaining([expect.any(String)]),
      })
    }
  })
})
