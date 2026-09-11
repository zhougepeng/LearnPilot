import type { TextbookProfile } from './types.ts'

/** Curated seventh-grade first-semester indexes used before a parent confirms a local copy. */
export const DEFAULT_TEXTBOOK_PROFILES: readonly TextbookProfile[] = [
  {
    id: 'preset-textbook-math-bnu-7a-2024', subject: 'math', grade: '七年级', term: '上册',
    publisher: '北京师范大学出版社', edition: '北师大版 2024版', volume: '上册',
    title: '北师大版 七年级数学上册 2024版', catalogStatus: 'preset',
    sourceFileName: '教材目录索引（待用户下载原件）', sourceUrl: 'https://keben.app/book/0334',
    chapterIndex: '第一章 丰富的图形世界：生活中的立体图形；从立体图形到平面图形\n第二章 有理数及其运算：认识有理数；有理数的加减运算；有理数的乘除运算；有理数的乘方；有理数的混合运算\n第三章 整式及其加减：代数式；整式的加减；探索与表达规律；问题解决策略：归纳\n第四章 基本平面图形：线段、射线、直线；角；多边形和圆的初步认识\n第五章 一元一次方程：认识方程；一元一次方程的解法；一元一次方程的应用；问题解决策略：直观分析\n第六章 数据的收集与整理：丰富的数据世界；数据的收集；数据的表示\n综合与实践：关注人口老龄化；制作一个尽可能大的无盖长方体形收纳盒',
  },
  {
    id: 'preset-textbook-chinese-pep-7a-2024', subject: 'chinese', grade: '七年级', term: '上册',
    publisher: '人民教育出版社', edition: '统编/人教版 2024版', volume: '上册',
    title: '统编版 七年级语文上册 2024版', catalogStatus: 'preset',
    sourceFileName: '国家中小学智慧教育平台（在线阅读）', sourceUrl: 'https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=8b9c7052-add4-4744-ab04-69d6c180d5d9&catalogType=tchMaterial&subCatalog=tchMaterial',
    chapterIndex: '第一单元：1 春；2 济南的冬天；3 雨的四季；古代诗歌四首\n第二单元：5 秋天的怀念；6 散步；7 散文诗二首；8《世说新语》二则\n第三单元：9 从百草园到三味书屋；10 往事依依；11 再塑生命的人；12《论语》十二章\n第四单元：13 纪念白求恩；14 回忆我的母亲；15 梅岭三章；16 诫子书\n第五单元：17 猫；18 我的白鸽；19 大雁归来；20 狼\n第六单元：21 小圣施威降大圣；22 皇帝的新装；23 女娲造人；24 寓言四则',
  },
  {
    id: 'preset-textbook-history-pep-7a-2024', subject: 'history', grade: '七年级', term: '上册',
    publisher: '人民教育出版社', edition: '统编/人教版 2024版', volume: '上册',
    title: '统编版 七年级历史上册 2024版', catalogStatus: 'preset',
    sourceFileName: '教材目录索引（待用户下载原件）', sourceUrl: 'https://www.dzkbw.org/book/4432.html',
    chapterIndex: '第一单元 史前时期：第1课 远古时期的人类活动；第2课 原始农业与史前社会；第3课 中华文明的起源\n第二单元 夏商周时期：第4课 夏商西周王朝的更替；第5课 动荡变化中的春秋时期；第6课 战国时期的社会变革；第7课 百家争鸣；第8课 夏商周时期的科技与文化\n第三单元 秦汉时期：第9课 秦统一中国；第10课 秦末农民大起义；第11课 西汉建立和“文景之治”；第12课 大一统王朝的巩固；第13课 东汉的兴衰；第14课 丝绸之路的开通与经营西域；第15课 秦汉时期的科技与文化\n第四单元 三国两晋南北朝时期：第16课 三国鼎立；第17课 西晋的短暂统一和北方各族的内迁；第18课 东晋南朝政治和江南地区开发；第19课 北朝政治和北方民族大交融；第20课 三国两晋南北朝时期的科技与文化；第21课 活动课',
  },
  {
    id: 'preset-textbook-biology-bnu-7a-2024', subject: 'biology', grade: '七年级', term: '上册',
    publisher: '北京师范大学出版社', edition: '北师大版 2024版', volume: '上册',
    title: '北师大版 七年级生物学上册 2024版', catalogStatus: 'preset',
    sourceFileName: '教材目录索引（待用户下载原件）', sourceUrl: 'https://www.dzkbw.org/book/5102.html',
    chapterIndex: '走进生命世界\n第1单元 探索生命奥秘：第1章 认识生物和生物学（形形色色的生物；生物学是探索生命的科学；生物学研究的基本方法）\n第2单元 生物体的结构：第2章 细胞（细胞的基本结构和功能；细胞是生命活动的单位）；第3章 生物体的结构层次（细胞通过分裂而增殖；细胞分化形成组织；生物体的器官、系统）\n第3单元 植物的生活：第4章 绿色开花植物的生活方式（光合作用；呼吸作用；吸收作用；运输作用；蒸腾作用；植物在生物圈中的作用）；第5章 绿色开花植物的生活史（种子萌发形成幼苗；营养器官的生长；生殖器官的生长）\n跨学科实践活动：栽培番茄；无土栽培一种植物',
  },
  {
    id: 'preset-textbook-english-bnu-7a-2024-pending', subject: 'english', grade: '七年级', term: '上册',
    publisher: '北京师范大学出版社', edition: '北师大版 2024秋版（待封面核对）', volume: '上册',
    title: '北师大版 七年级英语上册 2024秋版（待确认）', catalogStatus: 'needs_confirmation',
    sourceFileName: '教材目录索引（必须先核对封面和页码）', sourceUrl: 'https://dzkbw.org/book/5209.html',
    chapterIndex: 'Starter；Section 1 Meeting English；Section 2 Making New Friends；Section 3 Saying Hello；Section 4 My Best Friend；Section 5 My Sweet Family；Section 6 My Family Members；Section 7 My Room；Section 8 Our Neighbourhood；Section 9 Our Day；Section 10 Our School；Section 11 Our English Class；Section 12 Our Colourful World\nUnit 1 Family；Unit 2 School Life；Unit 3 Home and Places；Unit 4 Interests and Abilities',
  },
]
