/* oxlint-disable @stylistic/max-len -- curated reference text is kept readable as data. */
import type { ChapterAnalysis, TextbookChapter, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'

function chapterId(profileId: string, unitTitle: string, title: string): string {
  return `${profileId}::${encodeURIComponent(unitTitle)}::${encodeURIComponent(title)}`
}

/**
 * Parse the compact chapter index saved in a textbook profile for navigation.
 * @param profile - Textbook profile whose chapter index should be parsed.
 * @returns Navigable chapter entries in the order written by the user.
 */
export function parseTextbookChapters(profile: TextbookProfile): TextbookChapter[] {
  if (profile.chapterIndex === undefined || profile.chapterIndex.trim() === '') return []
  const chapters: TextbookChapter[] = []
  for (const line of profile.chapterIndex.split(/\r?\n+/)) {
    const separator = line.search(/[:：]/)
    if (separator < 0) continue
    const unitTitle = line.slice(0, separator).trim()
    if (unitTitle === '') continue
    const entries = line.slice(separator + 1).split(/[；;]/)
    for (const entry of entries) {
      const text = entry.trim()
      if (text === '') continue
      const match = /^(\d+(?:\.\d+)?)\s*(.+)$/.exec(text)
      const lessonNumber = match?.[1]
      const title = (match?.[2] ?? text).trim()
      if (title === '') continue
      chapters.push({
        id: chapterId(profile.id, unitTitle, title),
        textbookProfileId: profile.id,
        unitTitle,
        ...(lessonNumber === undefined ? {} : { lessonNumber }),
        title,
      })
    }
  }
  return chapters
}

/** Compact, version-neutral reference shown before a confirmed lesson source exists. */
export type ChapterReferencePreview = Pick<ChapterAnalysis, 'overview' | 'summary' | 'structure' | 'themes' | 'keyWords'>

type ChapterReferenceDraft = Omit<ChapterReferencePreview, 'structure'> & { readonly structure: readonly (readonly [string, string])[] }

function chapterReference(overview: string, summary: string, structure: readonly (readonly [string, string])[], themes: readonly string[], keyWords: readonly string[]): ChapterReferenceDraft {
  return { overview, summary, structure, themes, keyWords }
}

const CHAPTER_REFERENCE_DRAFTS: Readonly<Record<string, ChapterReferenceDraft>> = {
  '春': chapterReference('朱自清通过细腻的景物描写，描绘春回大地的蓬勃景象，表达对春天和生活的赞美。', '文章先盼春，再依次描写春草、春花、春风、春雨和迎春，最后用三个比喻赞美春天的活力与希望。', [['盼春', '点明期待和喜悦，为全文定下感情基调。'], ['绘春', '从植物、花朵、风雨和人的活动等角度展开多层次描写。'], ['赞春', '用富有动感的比喻收束全文，突出春天的新、美、力。']], ['热爱自然', '赞美生活', '希望与活力'], ['春草', '春花', '春风', '春雨', '迎春']),
  '济南的冬天': chapterReference('老舍抓住济南冬天“温晴”的特点，描绘山、水和城的秀美景色。', '文章以温晴为线索，先写总体感受，再写小山、薄雪覆盖的山、城外远山和水，表现对济南冬天的喜爱。', [['总体感受', '以对比突出济南冬天的温晴可爱。'], ['山景', '从阳光下的小山和薄雪小山写出层次与色彩。'], ['水景', '写水的清亮和生动，收束到温晴的冬天。']], ['热爱自然', '赞美济南'], ['温晴', '小山', '薄雪', '水色', '秀气']),
  '雨的四季': chapterReference('刘湛秋用诗意语言描写四季的雨，表现雨的不同性格和生命气息。', '文章按春夏秋冬写雨：春雨清新、夏雨热烈、秋雨端庄、冬雨自然，结尾表达对雨的喜爱和赞美。', [['春雨', '清新润泽，带来植物和大地的生机。'], ['夏雨', '热烈粗犷，冲刷炎热并带来畅快。'], ['秋冬雨', '秋雨端庄沉静，冬雨自然平静，各有季节气质。']], ['热爱自然', '感受生命'], ['春雨', '夏雨', '秋雨', '冬雨', '生机']),
  '古代诗歌四首': chapterReference('四首古诗从不同角度写景、抒情，体现古典诗歌借景抒情和寓情于景的特点。', '学习重点是结合意象、炼字和背景理解诗意，比较不同诗歌的情感表达与意境营造。', [['读懂诗意', '借助意象和关键词梳理诗句含义。'], ['体会意境', '把景物组合起来感受画面和氛围。'], ['理解情感', '联系作者处境，判断诗中寄托的情怀。']], ['借景抒情', '品味意境'], ['意象', '炼字', '对偶', '情景交融']),
  '秋天的怀念': chapterReference('史铁生回忆母亲在秋日里对自己的关爱，表达深切的怀念和悔恨。', '文章围绕“我”在双腿残疾后的暴躁与母亲的体谅展开，通过几件小事表现母亲的坚强、宽容和深沉的爱。', [['矛盾与隐忍', '写“我”的痛苦和母亲的默默承受。'], ['关爱细节', '通过看花等细节表现母亲的愿望与牵挂。'], ['回忆与领悟', '借菊花和妹妹的话完成情感升华。']], ['母爱', '悔恨与成长'], ['看花', '菊花', '母亲', '坚强', '怀念']),
  '散步': chapterReference('莫怀戚通过一次家庭散步，表现亲情、责任与尊老爱幼的传统美德。', '一家人在分歧中选择走大路，后来“我”背起母亲、妻子背起孩子，结尾用小路承载家庭责任。', [['分歧', '在走大路还是小路的选择中呈现家庭关系。'], ['选择', '“我”作出尊重长辈的决定，承担家庭责任。'], ['背负', '用背负的动作表现亲情和责任的重量。']], ['亲情', '责任', '尊老爱幼'], ['散步', '大路', '小路', '背负']),
  '散文诗二首': chapterReference('两首散文诗借物抒情，写出自然物象中的生命感受和人生思考。', '阅读时要抓住反复、象征和想象，理解诗中景物如何承载作者的情绪与哲思。', [['意象', '从花、鸟等物象入手，建立诗歌画面。'], ['抒情', '注意反复和语气变化，体会感情推进。'], ['象征', '联系上下文理解物象背后的意味。']], ['借物抒情', '生命思考'], ['意象', '象征', '反复', '想象']),
  '《世说新语》二则': chapterReference('两则短文通过具体情境和人物言行，展现魏晋人物的机智与风度。', '学习重点是疏通文意、积累文言词语，理解人物在家庭和交往场景中的应答与品格。', [['叙事场景', '交代人物、时间和对话背景。'], ['语言应对', '抓住关键语句判断人物的机智与分寸。'], ['人物品格', '从言行细节概括人物形象。']], ['机智应答', '人物风度'], ['文言实词', '对话', '咏雪', '陈太丘']),
  '从百草园到三味书屋': chapterReference('鲁迅回忆童年在百草园和三味书屋的生活，表现儿童的好奇、快乐与成长。', '文章先写百草园的自由有趣，再写三味书屋的读书生活，通过空间转换对照童年经验。', [['百草园', '用景物、传说和捕鸟写出童年的趣味。'], ['过渡', '告别百草园，带出成长中的失落。'], ['三味书屋', '通过先生、读书和游戏写出学习生活的复杂感受。']], ['童年记忆', '成长体验'], ['百草园', '三味书屋', '美女蛇', '捕鸟']),
  '往事依依': chapterReference('于漪回忆求学往事，表现文学阅读、老师教诲对成长和人生选择的影响。', '文章以往事为线索，写读书、听课和老师的启发，强调阅读积累与良师引导的价值。', [['回忆往事', '选取读书和课堂片段作为成长节点。'], ['文学熏陶', '写作品和朗读如何打开精神世界。'], ['人生启示', '从回忆中提炼对学习和做人的认识。']], ['阅读成长', '师生情谊'], ['往事', '读书', '老师', '启发']),
  '再塑生命的人': chapterReference('海伦·凯勒回忆莎莉文老师，表现教育如何帮助她认识文字、自然和世界。', '文章围绕“爱的启蒙”和“文字的发现”展开，写老师的耐心引导以及“我”从困惑到觉醒的变化。', [['初见老师', '写老师到来及“我”的抗拒与期待。'], ['认识文字', '通过水和文字的联系建立抽象概念。'], ['精神成长', '从感官体验走向对自然和爱的理解。']], ['教育改变', '感恩与成长'], ['莎莉文老师', '文字', '水', '启蒙']),
  '《论语》十二章': chapterReference('十二章语录集中体现孔子关于学习、修身、交友和实践的思想。', '学习重点是准确翻译文言语句，理解“学思结合、温故知新、见贤思齐”等修身方法。', [['学习方法', '讨论学习、思考、复习和实践的关系。'], ['修身做人', '强调自律、诚信、宽容和反省。'], ['交友处世', '从他人和日常行为中提升自己。']], ['学习修身', '自我反省'], ['学思结合', '温故知新', '见贤思齐', '三省吾身']),
  '纪念白求恩': chapterReference('毛泽东赞扬白求恩的国际主义和共产主义精神，号召学习他的高尚品格。', '文章先概述白求恩事迹，再从国际主义、工作态度和个人品质展开议论，最后联系自身提出号召。', [['概述事迹', '交代白求恩来华工作的背景和意义。'], ['对比论证', '把白求恩与一些人的态度对照，突出其品质。'], ['号召学习', '由个人评价上升到行动要求。']], ['国际主义', '敬业奉献'], ['白求恩', '国际主义', '毫不利己', '精益求精']),
  '回忆我的母亲': chapterReference('朱德回忆母亲勤劳、善良、坚韧的一生，表达敬爱与怀念。', '文章按生活经历组织材料，写母亲劳动、持家、待人和支持革命的事迹，并把母亲的品格与自己的成长联系起来。', [['母亲一生', '以时间和生活片段勾勒母亲经历。'], ['品格细节', '通过劳动、待人接物突出勤劳善良。'], ['深沉怀念', '把个人感情与报国责任结合起来。']], ['母爱', '勤劳坚韧'], ['母亲', '劳动', '勤俭', '报国']),
  '梅岭三章': chapterReference('陈毅以组诗写身处险境时的革命信念、牺牲精神和胜利信心。', '三首诗分别写牺牲无惧、英魂不灭和革命必胜，形成由个人生死到革命前途的情感推进。', [['视死如归', '把个人生死置于革命事业之中。'], ['英魂不灭', '想象牺牲后的精神传承和战斗。'], ['胜利信念', '以坚定语气展望革命胜利。']], ['革命信念', '牺牲精神'], ['梅岭', '断头', '英魂', '捷报']),
  '诫子书': chapterReference('诸葛亮以书信告诫儿子修身养德、静心学习，体现传统家训智慧。', '文章从静、俭、志、学等方面说明修身与成才的关系，语言简洁而有逻辑。', [['立德', '以静和俭作为修养品格的基础。'], ['立志', '说明志向不坚定就难以成学。'], ['惜时', '提醒年华易逝，应及时修身学习。']], ['修身立志', '珍惜时间'], ['宁静', '俭朴', '明志', '成学']),
  '猫': chapterReference('郑振铎通过三次养猫经历，表达对生命的尊重、反思和愧疚。', '文章按三只猫的来去组织叙事，重点写第三只猫受误解后死亡，反思偏见和主观判断造成的伤害。', [['三只猫', '比较不同猫的外形、性情和家庭待遇。'], ['误会冲突', '由鸟被偷引发对第三只猫的错误判断。'], ['自省愧疚', '在真相揭开后反思武断和偏见。']], ['尊重生命', '反思偏见'], ['三只猫', '鸟', '误会', '愧疚']),
  '我的白鸽': chapterReference('通过观察和照料白鸽，写人与动物相处中的亲近、信任和责任。', '文章以白鸽的外形、动作和生活变化为线索，表现细致观察带来的情感联系。', [['外形动作', '抓住羽色、姿态和飞行表现白鸽特点。'], ['相处过程', '写喂养、观察和逐渐建立的亲近。'], ['情感体会', '由动物生活联想到陪伴与责任。']], ['亲近自然', '生命陪伴'], ['白鸽', '观察', '飞翔', '陪伴']),
  '大雁归来': chapterReference('利奥波德记录大雁归来及其生活习性，表达对自然生命的敬意。', '文章以大雁迁徙、鸣叫和群体生活为重点，说明人与自然应建立平等、友善的关系。', [['归来景象', '写大雁迁徙带来的季节信号和活力。'], ['群体生活', '从叫声、队形和习性展现大雁社会性。'], ['生态思考', '由观察自然上升到保护生命的态度。']], ['敬畏自然', '生态意识'], ['大雁', '迁徙', '群体', '保护']),
  '狼': chapterReference('蒲松龄写屠户与两只狼的斗争，揭示贪婪的狼和勇敢机智的人。', '故事按遇狼、惧狼、御狼和毙狼推进，结尾用议论指出对恶势力不能妥协退让。', [['遇狼惧狼', '写屠户由害怕到被逼入困境。'], ['依势御狼', '利用麦场和积薪改变力量对比。'], ['毙狼议狼', '揭示狼的贪婪和人的勇敢机智。']], ['勇敢机智', '反抗贪婪'], ['屠户', '两狼', '麦场', '积薪']),
  '小圣施威降大圣': chapterReference('选段通过孙悟空和二郎神的多次变化斗法，展现神话故事的想象力和战斗节奏。', '情节围绕追逐、变化和识破展开，重点体会夸张想象、动作描写和快节奏叙事。', [['变化斗法', '双方连续变形，制造悬念和趣味。'], ['追逐较量', '用动作和对话推动冲突升级。'], ['神话想象', '借奇幻场景表现人物本领和性格。']], ['想象力', '机智较量'], ['孙悟空', '二郎神', '变化', '斗法']),
  '皇帝的新装': chapterReference('安徒生用荒诞童话讽刺虚荣、愚蠢和随声附和的社会心理。', '骗子以“看不见的布”操纵皇帝和大臣，最后由孩子说出真话，形成强烈反差。', [['骗局展开', '骗子利用虚荣心设置荒诞骗局。'], ['群体附和', '大臣和百姓因害怕或虚荣而说假话。'], ['孩子揭穿', '孩子的真话打破集体谎言。']], ['反对虚荣', '追求真话'], ['皇帝', '骗子', '新装', '孩子']),
  '女娲造人': chapterReference('神话通过女娲造人和使人类繁衍的故事，表达对生命起源的想象。', '故事先写女娲因孤独造出人，再写用泥团和藤条批量造人，表现丰富的原始想象和创造精神。', [['造人缘起', '女娲因天地寂静而产生造人的愿望。'], ['造人方法', '从泥团塑造到藤条挥洒，想象不断扩展。'], ['繁衍人类', '让人类延续，回应生命和世界的需要。']], ['生命想象', '创造精神'], ['女娲', '泥土', '人类', '神话']),
  '寓言四则': chapterReference('四则寓言借短小故事寄托道理，训练从情节、人物和结局概括寓意。', '阅读时要区分故事表层和寓意深层，关注夸张、反转、对比等寓言表达方式。', [['读懂故事', '梳理人物、起因、经过和结果。'], ['寻找反转', '关注结局如何改变读者预期。'], ['概括寓意', '用简洁语言说明故事讽刺或启示。']], ['寓意阅读', '反思判断'], ['寓言', '反转', '讽刺', '启示']),
}

/**
 * Return built-in reference material for chapters whose common lesson content is stable enough to preview.
 * @param chapter - Chapter selected from a textbook index.
 * @returns A compact preview, or `undefined` when the chapter still needs source text.
 */
export function builtInChapterReference(chapter: TextbookChapter | undefined): ChapterReferencePreview | undefined {
  const draft = chapter?.title === undefined ? undefined : CHAPTER_REFERENCE_DRAFTS[chapter.title]
  if (draft === undefined) return undefined
  return {
    overview: draft.overview,
    summary: draft.summary,
    structure: draft.structure.map(([title, body]) => ({ title, body, sourceRefs: [] })),
    themes: draft.themes,
    keyWords: draft.keyWords,
  }
}
