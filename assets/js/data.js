/* =========================================================
   ProjectMatch — данные (демо-база профилей)

   Здесь лежит «сид» базы: роли, интересы, синонимы и 40 учебных профилей.
   При первом открытии сайта db.js копирует это в localStorage
   и дальше работает уже с локальной базой (избранное, приглашения).

   Как заменить на реальный бэкенд (Supabase / Google Sheets):
   1. оставить структуру профиля такой же;
   2. в db.js заменить чтение localStorage на запрос к API;
   3. всё остальное (поиск, карточки, фильтры) менять не нужно.

   ВАЖНО: имена и биографии вымышленные — это учебный прототип.
   ========================================================= */
(function () {
  'use strict';

  /* Версия сида. При изменении профилей увеличьте число,
     чтобы у всех открылась обновлённая база (избранное сохранится). */
  var VERSION = 3;

  /* ---------- Роли: подписи на двух языках + синонимы для поиска ----------
     В kw — только слова про саму роль. Названия технологий живут
     в skills-синонимах ниже: иначе «python» находил бы всех бэкендеров. */
  var ROLES = {
    frontend: {
      ru: 'Frontend-разработчик',
      kk: 'Frontend әзірлеуші',
      kw: ['frontend', 'фронтенд', 'фронтендер', 'верстка', 'верстальщик', 'интерфейс', 'сайт', 'веб', 'web']
    },
    backend: {
      ru: 'Backend-разработчик',
      kk: 'Backend әзірлеуші',
      kw: ['backend', 'бэкенд', 'бекенд', 'бэкендер', 'сервер', 'api', 'база данных', 'разработчик']
    },
    designer: {
      ru: 'Дизайнер',
      kk: 'Дизайнер',
      kw: ['дизайн', 'дизайнер', 'design', 'designer', 'графика', 'макет', 'прототип', 'брендинг', 'айдентика']
    },
    researcher: {
      ru: 'Исследователь',
      kk: 'Зерттеуші',
      kw: ['исследован', 'research', 'опрос', 'интервью', 'аналитик', 'анализ', 'социолог', 'пользовател']
    },
    data: {
      ru: 'Аналитик данных',
      kk: 'Деректер талдаушысы',
      kw: ['данные', 'data', 'аналитик', 'визуализац', 'таблица', 'статистик', 'дашборд']
    },
    pm: {
      ru: 'Организатор проекта',
      kk: 'Жоба ұйымдастырушысы',
      kw: ['менеджер', 'организатор', 'pm', 'проджект', 'руководител', 'тимлид', 'планирован', 'презентац', 'команда']
    },
    marketing: {
      ru: 'Маркетолог / SMM',
      kk: 'Маркетолог / SMM',
      kw: ['маркет', 'smm', 'соцсет', 'реклам', 'контент', 'копирайт', 'продвижен', 'бренд', 'инстаграм']
    },
    media: {
      ru: 'Видео и медиа',
      kk: 'Бейне және медиа',
      kw: ['видео', 'монтаж', 'съемк', 'сьемк', 'оператор', 'подкаст', 'медиа', 'сценар', 'фото']
    },
    robotics: {
      ru: 'Робототехник',
      kk: 'Робототехник',
      kw: ['робот', 'робототехник', '3d', 'инженер', 'пайка', 'схем', 'ros', 'механик']
    },
    bio: {
      ru: 'Био и медицина',
      kk: 'Био және медицина',
      kw: ['биолог', 'медицин', 'хими', 'лаборатор', 'здоров', 'анатом', 'эколог']
    }
  };

  /* ---------- Интересы (темы проектов) ---------- */
  var INTERESTS = {
    ai: { ru: 'Нейросети', kk: 'Нейрожелілер', kw: ['ии', 'ai', 'нейросет', 'нейрон', 'ml', 'machine learning', 'gpt', 'чат-бот', 'искусственн'] },
    eco: { ru: 'Эко-tech', kk: 'Эко-tech', kw: ['эко', 'eco', 'эколог', 'природ', 'климат', 'воздух', 'мониторинг', 'green', 'зелен'] },
    edtech: { ru: 'EdTech', kk: 'EdTech', kw: ['edtech', 'образован', 'школ', 'учеб', 'образоват', 'кружок'] },
    media: { ru: 'Медиа', kk: 'Медиа', kw: ['медиа', 'контент', 'подкаст', 'видео', 'соцсети', 'блог'] },
    games: { ru: 'Игры', kk: 'Ойындар', kw: ['игр', 'games', 'гейм', 'геймдев', 'геймдизайн', 'unity', 'godot'] },
    city: { ru: 'Урбанистика', kk: 'Урбанистика', kw: ['город', 'урбан', 'транспорт', 'район', 'карта', 'city', 'улиц'] },
    social: { ru: 'Соцпроекты', kk: 'Әлеуметтік жобалар', kw: ['соц', 'волонтер', 'помощь', 'обществен', 'social', 'благотвор'] },
    bio: { ru: 'Био и медицина', kk: 'Био және медицина', kw: ['био', 'медицин', 'биолог', 'здоров', 'хими', 'организм'] },
    finance: { ru: 'Финансы', kk: 'Қаржы', kw: ['финанс', 'деньги', 'бюджет', 'предпринимат', 'бизнес', 'инвест', 'finance'] },
    sport: { ru: 'Спорт', kk: 'Спорт', kw: ['спорт', 'sport', 'тренировк', 'турнир', 'футбол', 'бег'] }
  };

  /* ---------- Синонимы для умного поиска ----------
     words — как люди пишут и говорят (включая русское написание технологий),
     concepts — роль или интерес ('i:' + ключ), а skills — конкретный навык
     из профиля. Если указан skills, поиск не размазывается на всю роль:
     «пайтон» найдёт людей с Python, а не всех бэкендеров.
     Окончания и регистр не важны: «пайтон», «пайтоне», «Пайтон». */
  var SYNONYMS = [
    /* Технологии → конкретный навык */
    { words: ['пайтон', 'питон', 'пайтоне', 'python3'], skills: ['python'] },
    { words: ['джаваскрипт', 'жаваскрипт', 'javascript', 'js', 'жс'], skills: ['javascript'] },
    { words: ['тайпскрипт', 'typescript', 'ts'], skills: ['typescript'] },
    { words: ['реакт', 'reactjs'], skills: ['react'] },
    { words: ['вью', 'вю', 'vuejs'], skills: ['vue'] },
    { words: ['нукст', 'nuxtjs'], skills: ['nuxt'] },
    { words: ['нод', 'нода', 'нодjs', 'nodejs'], skills: ['node.js'] },
    { words: ['джанго'], skills: ['django'] },
    { words: ['фастапи'], skills: ['fastapi'] },
    { words: ['постгрес', 'постгресс', 'постгре'], skills: ['postgresql'] },
    { words: ['докер'], skills: ['docker'] },
    { words: ['кубернетес', 'k8s'], skills: ['kubernetes'] },
    { words: ['скул', 'сиквел'], skills: ['sql'] },
    { words: ['фигма', 'фигме', 'фигму'], skills: ['figma'] },
    { words: ['юикс', 'юай', 'uxui'], skills: ['ui/ux'] },
    { words: ['смм', 'сэм', 'эсэмэм', 'сммщик', 'таргет'], skills: ['smm'] },
    { words: ['ардуино', 'ардуина', 'ардуинка'], skills: ['arduino'] },
    { words: ['стм', 'стм32'], skills: ['stm32'] },
    { words: ['премьер', 'premiere'], skills: ['premiere'] },
    { words: ['ноушен', 'notion'], skills: ['notion'] },
    { words: ['иллюстратор', 'иллюстрация'], skills: ['иллюстрация'] },
    { words: ['моушн', 'моушен'], skills: ['моушн'] },
    { words: ['нейронка', 'нейронки', 'нейросетка', 'чатбот'], skills: ['ml', 'нейросет'] },

    /* Роли и общие слова */
    { words: ['фронтендер', 'фронт', 'фронтэнд', 'верстальщик'], concepts: ['frontend'] },
    { words: ['бэкендер', 'бекендер', 'бэк'], concepts: ['backend'] },
    { words: ['фулстек', 'фуллстек'], concepts: ['frontend', 'backend'] },
    { words: ['тестировщик', 'тестер', 'qa'], concepts: ['frontend', 'backend'] },
    { words: ['проджект', 'продакт', 'тимлид', 'скрам'], concepts: ['pm'] },
    { words: ['датасаентист', 'датасайентист'], concepts: ['data'] },

    /* Темы проектов */
    { words: ['геймдев', 'геймдевелопер', 'игродел', 'юнити'], concepts: ['i:games'], skills: ['unity', 'godot'] },
    { words: ['экотех', 'экология', 'климат'], concepts: ['i:eco'] },
    { words: ['эдтех', 'едтех'], concepts: ['i:edtech'] },
    { words: ['медик', 'медицина'], concepts: ['bio', 'i:bio'] },
    { words: ['соцпроект', 'волонтер'], concepts: ['i:social'] },
    { words: ['финансист', 'бизнес'], concepts: ['i:finance'] },
    { words: ['бағдарламашы', 'бағдарламалау'], concepts: ['frontend', 'backend'] }
  ];

  /* ---------- Профили ---------- */
  var PROFILES = [
    {
      id: 'p01',
      name: 'Маша Климова',
      initials: 'МК',
      tone: 'violet',
      role: 'frontend',
      grade: 10,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '5-7',
      skills: ['React', 'TypeScript', 'Figma'],
      interests: ['edtech', 'ai'],
      lookingFor: ['backend', 'designer'],
      projects: 2,
      bio: {
        ru: 'Собирает интерфейсы на React и хочет сделать сервис, который помогает школьным кружкам находить участников.',
        kk: 'React-та интерфейстер жасайды және мектеп үйірмелеріне қатысушы табуға көмектесетін сервис жасағысы келеді.'
      }
    },
    {
      id: 'p02',
      name: 'Артём Соколов',
      initials: 'АС',
      tone: 'lime',
      role: 'backend',
      grade: 11,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '5-7',
      skills: ['Python', 'FastAPI', 'PostgreSQL'],
      interests: ['eco', 'city'],
      lookingFor: ['frontend', 'designer'],
      projects: 3,
      bio: {
        ru: 'Пишет API на FastAPI, разбирается в данных. Ищет проект про экологию или город.',
        kk: 'FastAPI-де API жазады, деректермен жұмыс істейді. Экология немесе қала туралы жоба іздейді.'
      }
    },
    {
      id: 'p03',
      name: 'Лиза Дорохова',
      initials: 'ЛД',
      tone: 'coral',
      role: 'designer',
      grade: 9,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '2-4',
      skills: ['Figma', 'UX-research', 'Прототипы'],
      interests: ['edtech', 'media'],
      lookingFor: ['frontend', 'researcher'],
      projects: 1,
      bio: {
        ru: 'Делает понятные интерфейсы и любит исследовать пользователей. Ведёт школьную студию дизайна.',
        kk: 'Түсінікті интерфейстер жасайды және қолданушыларды зерттеуді ұнатады. Мектептегі дизайн студиясын басқарады.'
      }
    },
    {
      id: 'p04',
      name: 'Тимур Рахимов',
      initials: 'ТР',
      tone: 'sky',
      role: 'data',
      grade: 11,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '5-7',
      skills: ['Python', 'pandas', 'ML'],
      interests: ['ai', 'finance'],
      lookingFor: ['backend', 'designer'],
      projects: 2,
      bio: {
        ru: 'Обучает небольшие модели и разбирается в таблицах. Хочет проект про финансы или ИИ.',
        kk: 'Шағын модельдерді оқытады, кестелермен жұмыс істейді. Қаржы немесе ЖИ туралы жоба қалайды.'
      }
    },
    {
      id: 'p05',
      name: 'Алина Сеитова',
      initials: 'АС',
      tone: 'violet',
      role: 'marketing',
      grade: 10,
      city: 'Шымкент',
      cityKk: 'Шымкент',
      capacity: '2-4',
      skills: ['SMM', 'Копирайтинг', 'Canva'],
      interests: ['social', 'media'],
      lookingFor: ['designer', 'pm'],
      projects: 2,
      bio: {
        ru: 'Ведёт соцсети школьного проекта и умеет писать коротко и по делу.',
        kk: 'Мектеп жобасының әлеуметтік желілерін жүргізеді, қысқа әрі нақты жаза алады.'
      }
    },
    {
      id: 'p06',
      name: 'Данияр Оспанов',
      initials: 'ДО',
      tone: 'lime',
      role: 'robotics',
      grade: 9,
      city: 'Караганда',
      cityKk: 'Қарағанды',
      capacity: '5-7',
      skills: ['Arduino', 'C++', '3D-печать'],
      interests: ['games', 'city'],
      lookingFor: ['frontend', 'designer'],
      projects: 1,
      bio: {
        ru: 'Собирает роботов на Arduino и печатает детали на 3D-принтере. Любит игры и городские штуки.',
        kk: 'Arduino-да роботтар жинайды, бөлшектерді 3D-принтерде басып шығарады. Ойындар мен қалалық жобаларды ұнатады.'
      }
    },
    {
      id: 'p07',
      name: 'София Ким',
      initials: 'СК',
      tone: 'coral',
      role: 'designer',
      grade: 11,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: 'gt7',
      skills: ['Figma', 'After Effects', 'Брендинг'],
      interests: ['media', 'games'],
      lookingFor: ['media', 'researcher'],
      projects: 3,
      bio: {
        ru: 'Собирает айдентику и анимацию, делает школьные фестивали визуально заметными.',
        kk: 'Айдентика мен анимация жасайды, мектеп фестивальдерін көрнекі етеді.'
      }
    },
    {
      id: 'p08',
      name: 'Егор Волков',
      initials: 'ЕВ',
      tone: 'sky',
      role: 'frontend',
      grade: 8,
      city: 'Караганда',
      cityKk: 'Қарағанды',
      capacity: '2-4',
      skills: ['HTML', 'CSS', 'JavaScript'],
      interests: ['games', 'sport'],
      lookingFor: ['designer', 'data'],
      projects: 0,
      bio: {
        ru: 'Учится фронтенду и уже собрал три небольших сайта. Хочет проект про игры или спорт.',
        kk: 'Frontend үйреніп жүр, үш шағын сайт жасады. Ойындар немесе спорт туралы жоба қалайды.'
      }
    },
    {
      id: 'p09',
      name: 'Камила Ахметова',
      initials: 'КА',
      tone: 'violet',
      role: 'researcher',
      grade: 10,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '5-7',
      skills: ['Интервью', 'Опросы', 'Анализ'],
      interests: ['social', 'edtech'],
      lookingFor: ['designer', 'pm'],
      projects: 2,
      bio: {
        ru: 'Провела 40 интервью для школьных проектов. Умеет превращать ответы в выводы.',
        kk: 'Мектеп жобалары үшін 40 сұхбат өткізді. Жауаптарды қорытындыға айналдыра алады.'
      }
    },
    {
      id: 'p10',
      name: 'Никита Морозов',
      initials: 'НМ',
      tone: 'lime',
      role: 'backend',
      grade: 10,
      city: 'Актобе',
      cityKk: 'Ақтөбе',
      capacity: '2-4',
      skills: ['Node.js', 'PostgreSQL', 'Docker'],
      interests: ['finance', 'ai'],
      lookingFor: ['frontend', 'pm'],
      projects: 1,
      bio: {
        ru: 'Любит аккуратные API и автоматизацию. Ищет команду для проекта про финансы.',
        kk: 'Ұқыпты API мен автоматизацияны ұнатады. Қаржы жобасына команда іздейді.'
      }
    },
    {
      id: 'p11',
      name: 'Аяна Бекова',
      initials: 'АБ',
      tone: 'coral',
      role: 'media',
      grade: 9,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '2-4',
      skills: ['Монтаж', 'Premiere', 'Сценарий'],
      interests: ['media', 'sport'],
      lookingFor: ['pm', 'frontend'],
      projects: 1,
      bio: {
        ru: 'Монтирует ролики про школу и спорт, пишет сценарии для коротких видео.',
        kk: 'Мектеп пен спорт туралы бейнелерді монтаждайды, қысқа видеоға сценарий жазады.'
      }
    },
    {
      id: 'p12',
      name: 'Илья Смирнов',
      initials: 'ИС',
      tone: 'sky',
      role: 'pm',
      grade: 11,
      city: 'Онлайн',
      cityKk: 'Онлайн',
      capacity: '5-7',
      skills: ['Notion', 'Планирование', 'Питч'],
      interests: ['edtech', 'social'],
      lookingFor: ['designer', 'backend'],
      projects: 3,
      bio: {
        ru: 'Собирает команды и расписания, доводил проекты до защиты. Силён в питче.',
        kk: 'Командалар мен кестелерді жинайды, жобаларды қорғауға дейін жеткізді. Питчте мықты.'
      }
    },
    {
      id: 'p13',
      name: 'Жанна Нурланова',
      initials: 'ЖН',
      tone: 'violet',
      role: 'bio',
      grade: 11,
      city: 'Шымкент',
      cityKk: 'Шымкент',
      capacity: '5-7',
      skills: ['Биология', 'Химия', 'Лаборатория'],
      interests: ['bio', 'eco'],
      lookingFor: ['data', 'media'],
      projects: 2,
      bio: {
        ru: 'Разбирается в биологии и химии, ставит опыты и описывает результаты.',
        kk: 'Биология мен химияны жақсы біледі, тәжірибе жасап, нәтижелерін сипаттайды.'
      }
    },
    {
      id: 'p14',
      name: 'Михаил Орлов',
      initials: 'МО',
      tone: 'lime',
      role: 'data',
      grade: 9,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '2-4',
      skills: ['Excel', 'Google Sheets', 'Визуализация'],
      interests: ['sport', 'finance'],
      lookingFor: ['researcher', 'pm'],
      projects: 0,
      bio: {
        ru: 'Считает статистику школьных турниров и делает понятные таблицы и графики.',
        kk: 'Мектеп турнирлерінің статистикасын есептеп, түсінікті кестелер мен графиктер жасайды.'
      }
    },
    {
      id: 'p15',
      name: 'Дана Кабылова',
      initials: 'ДК',
      tone: 'coral',
      role: 'designer',
      grade: 10,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '5-7',
      skills: ['UI/UX', 'Прототипы', 'Figma'],
      interests: ['eco', 'city'],
      lookingFor: ['frontend', 'backend'],
      projects: 1,
      bio: {
        ru: 'Проектирует интерфейсы для городских сервисов, любит тестировать на людях.',
        kk: 'Қалалық сервистерге интерфейстер жасайды, адамдармен тестілеуді ұнатады.'
      }
    },
    {
      id: 'p16',
      name: 'Роман Титов',
      initials: 'РТ',
      tone: 'sky',
      role: 'robotics',
      grade: 11,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: 'gt7',
      skills: ['STM32', 'ROS', 'Пайка'],
      interests: ['city', 'eco'],
      lookingFor: ['backend', 'data'],
      projects: 3,
      bio: {
        ru: 'Собирает устройства с датчиками и выводит данные в приложение. Хакатонный опыт.',
        kk: 'Датчиктері бар құрылғылар жасап, деректерді қосымшаға шығарады. Хакатон тәжірибесі бар.'
      }
    },
    {
      id: 'p17',
      name: 'Айгерим Сапарова',
      initials: 'АС',
      tone: 'violet',
      role: 'marketing',
      grade: 11,
      city: 'Актобе',
      cityKk: 'Ақтөбе',
      capacity: '5-7',
      skills: ['Контент', 'Reels', 'Аналитика'],
      interests: ['social', 'edtech'],
      lookingFor: ['media', 'designer'],
      projects: 2,
      bio: {
        ru: 'Делает контент-планы и ролики, смотрит на цифры, а не на ощущения.',
        kk: 'Контент-жоспар мен бейнелер жасайды, сезімге емес, сандарға қарайды.'
      }
    },
    {
      id: 'p18',
      name: 'Владислав Ким',
      initials: 'ВК',
      tone: 'lime',
      role: 'frontend',
      grade: 11,
      city: 'Шымкент',
      cityKk: 'Шымкент',
      capacity: '5-7',
      skills: ['Vue', 'JavaScript', 'Анимации'],
      interests: ['media', 'ai'],
      lookingFor: ['designer', 'backend'],
      projects: 2,
      bio: {
        ru: 'Собирает быстрые интерфейсы с анимациями, пробует связки с нейросетями.',
        kk: 'Анимациялары бар жылдам интерфейстер жасайды, нейрожелілермен байланысты сынап көреді.'
      }
    },
    {
      id: 'p19',
      name: 'Айша Мукашева',
      initials: 'АМ',
      tone: 'violet',
      role: 'frontend',
      grade: 9,
      city: 'Тараз',
      cityKk: 'Тараз',
      capacity: '2-4',
      skills: ['HTML', 'CSS', 'JavaScript'],
      interests: ['edtech', 'games'],
      lookingFor: ['designer', 'backend'],
      projects: 1,
      bio: {
        ru: 'Делает учебные сайты и мини-игры в браузере. Хочет собрать команду для школьного тренажёра.',
        kk: 'Оқу сайттары мен браузердегі шағын ойындар жасайды. Мектеп тренажері үшін команда жинағысы келеді.'
      }
    },
    {
      id: 'p20',
      name: 'Нурсултан Абишев',
      initials: 'НА',
      tone: 'sky',
      role: 'backend',
      grade: 11,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: 'gt7',
      skills: ['Go', 'PostgreSQL', 'Kubernetes'],
      interests: ['finance', 'city'],
      lookingFor: ['frontend', 'pm'],
      projects: 3,
      bio: {
        ru: 'Пишет сервисы на Go и любит нагрузки. Ищет проект про городские данные или финансы.',
        kk: 'Go-да сервистер жазады, жүктемені ұнатады. Қалалық деректер немесе қаржы жобасын іздейді.'
      }
    },
    {
      id: 'p21',
      name: 'Диана Ержанова',
      initials: 'ДЕ',
      tone: 'coral',
      role: 'designer',
      grade: 10,
      city: 'Шымкент',
      cityKk: 'Шымкент',
      capacity: '5-7',
      skills: ['Figma', 'Иллюстрация', 'Айдентика'],
      interests: ['social', 'media'],
      lookingFor: ['marketing', 'frontend'],
      projects: 2,
      bio: {
        ru: 'Рисует айдентику для школьных мероприятий и собирает понятные лендинги.',
        kk: 'Мектеп іс-шараларына айдентика салады, түсінікті лендингтер жасайды.'
      }
    },
    {
      id: 'p22',
      name: 'Ерасыл Каиров',
      initials: 'ЕК',
      tone: 'lime',
      role: 'robotics',
      grade: 10,
      city: 'Павлодар',
      cityKk: 'Павлодар',
      capacity: '2-4',
      skills: ['Arduino', 'Электроника', '3D-печать'],
      interests: ['eco', 'city'],
      lookingFor: ['data', 'designer'],
      projects: 1,
      bio: {
        ru: 'Собирает станции мониторинга воздуха на Arduino. Нужны люди для приложения и графиков.',
        kk: 'Arduino-да ауа мониторингі станцияларын жасайды. Қосымша мен графиктер үшін адамдар керек.'
      }
    },
    {
      id: 'p23',
      name: 'Карина Волкова',
      initials: 'КВ',
      tone: 'sky',
      role: 'media',
      grade: 11,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '5-7',
      skills: ['Видеосъёмка', 'Premiere', 'Цветокоррекция'],
      interests: ['sport', 'media'],
      lookingFor: ['pm', 'marketing'],
      projects: 2,
      bio: {
        ru: 'Снимает школьный спорт и монтирует репортажи. Хочет сделать документальный мини-сериал.',
        kk: 'Мектеп спортын түсіріп, репортаждарды монтаждайды. Шағын деректі сериал жасағысы келеді.'
      }
    },
    {
      id: 'p24',
      name: 'Алишер Жумабаев',
      initials: 'АЖ',
      tone: 'violet',
      role: 'data',
      grade: 11,
      city: 'Шымкент',
      cityKk: 'Шымкент',
      capacity: '5-7',
      skills: ['Python', 'ML', 'Визуализация'],
      interests: ['ai', 'finance'],
      lookingFor: ['backend', 'designer'],
      projects: 2,
      bio: {
        ru: 'Учит модели предсказывать цены и делает наглядные графики. Ищет проект про финансы.',
        kk: 'Модельдерге бағаны болжауды үйретеді, көрнекі графиктер жасайды. Қаржы жобасын іздейді.'
      }
    },
    {
      id: 'p25',
      name: 'Валерия Соколова',
      initials: 'ВС',
      tone: 'coral',
      role: 'researcher',
      grade: 11,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '5-7',
      skills: ['Интервью', 'Социология', 'Анализ'],
      interests: ['social', 'edtech'],
      lookingFor: ['designer', 'pm'],
      projects: 3,
      bio: {
        ru: 'Провела два школьных исследования и умеет задавать неудобные вопросы.',
        kk: 'Екі мектеп зерттеуін жүргізді, қиын сұрақтар қоюды біледі.'
      }
    },
    {
      id: 'p26',
      name: 'Жасмин Ахмет',
      initials: 'ЖА',
      tone: 'lime',
      role: 'marketing',
      grade: 9,
      city: 'Караганда',
      cityKk: 'Қарағанды',
      capacity: '2-4',
      skills: ['TikTok', 'Reels', 'Копирайтинг'],
      interests: ['media', 'sport'],
      lookingFor: ['media', 'designer'],
      projects: 1,
      bio: {
        ru: 'Снимает короткие видео про школьную жизнь и понимает, что заходит зрителям.',
        kk: 'Мектеп өмірі туралы қысқа бейнелер түсіреді және көрерменге не ұнайтынын түсінеді.'
      }
    },
    {
      id: 'p27',
      name: 'Мирас Бектурганов',
      initials: 'МБ',
      tone: 'sky',
      role: 'frontend',
      grade: 11,
      city: 'Актобе',
      cityKk: 'Ақтөбе',
      capacity: '5-7',
      skills: ['React', 'Next.js', 'Tailwind'],
      interests: ['edtech', 'ai'],
      lookingFor: ['backend', 'designer'],
      projects: 3,
      bio: {
        ru: 'Собирает образовательные веб-приложения и следит за скоростью загрузки.',
        kk: 'Білім беру веб-қосымшаларын жасайды, жүктелу жылдамдығын қадағалайды.'
      }
    },
    {
      id: 'p28',
      name: 'Полина Лебедева',
      initials: 'ПЛ',
      tone: 'violet',
      role: 'designer',
      grade: 8,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '2-4',
      skills: ['Figma', 'Canva', 'Иллюстрация'],
      interests: ['games', 'media'],
      lookingFor: ['frontend', 'researcher'],
      projects: 0,
      bio: {
        ru: 'Рисует персонажей и собирает первые макеты игр. Хочет учиться у более опытных.',
        kk: 'Кейіпкерлер салады, ойындардың алғашқы макеттерін жасайды. Тәжірибелі адамдардан үйренгісі келеді.'
      }
    },
    {
      id: 'p29',
      name: 'Санжар Оспанов',
      initials: 'СО',
      tone: 'lime',
      role: 'backend',
      grade: 9,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '2-4',
      skills: ['Python', 'Django', 'SQL'],
      interests: ['eco', 'city'],
      lookingFor: ['frontend', 'data'],
      projects: 1,
      bio: {
        ru: 'Пишет API для школьных проектов про экологию. Разбирается в базах данных.',
        kk: 'Экология туралы мектеп жобаларына API жазады. Дерекқорларды түсінеді.'
      }
    },
    {
      id: 'p30',
      name: 'Аружан Сейтова',
      initials: 'АС',
      tone: 'coral',
      role: 'pm',
      grade: 10,
      city: 'Шымкент',
      cityKk: 'Шымкент',
      capacity: '5-7',
      skills: ['Notion', 'Scrum', 'Питч'],
      interests: ['social', 'eco'],
      lookingFor: ['designer', 'researcher'],
      projects: 2,
      bio: {
        ru: 'Собирает команды и следит за дедлайнами. Доводила два соцпроекта до защиты.',
        kk: 'Командаларды жинайды, дедлайндарды қадағалайды. Екі әлеуметтік жобаны қорғауға жеткізді.'
      }
    },
    {
      id: 'p31',
      name: 'Кирилл Мороз',
      initials: 'КМ',
      tone: 'sky',
      role: 'media',
      grade: 10,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '5-7',
      skills: ['After Effects', 'Моушн', 'Звук'],
      interests: ['games', 'ai'],
      lookingFor: ['frontend', 'pm'],
      projects: 1,
      bio: {
        ru: 'Делает моушн-графику и звук для школьных проектов. Любит игры и интерактив.',
        kk: 'Мектеп жобаларына моушн-графика мен дыбыс жасайды. Ойындар мен интерактивті ұнатады.'
      }
    },
    {
      id: 'p32',
      name: 'Инкар Нурпеисова',
      initials: 'ИН',
      tone: 'violet',
      role: 'bio',
      grade: 10,
      city: 'Тараз',
      cityKk: 'Тараз',
      capacity: '2-4',
      skills: ['Биология', 'Экология', 'Полевые исследования'],
      interests: ['bio', 'eco'],
      lookingFor: ['data', 'media'],
      projects: 1,
      bio: {
        ru: 'Изучает качество воды в местных водоёмах и собирает пробы для школьной лаборатории.',
        kk: 'Жергілікті су қоймаларының сапасын зерттеп, мектеп зертханасына сынамалар жинайды.'
      }
    },
    {
      id: 'p33',
      name: 'Дамир Кусаинов',
      initials: 'ДК',
      tone: 'lime',
      role: 'robotics',
      grade: 11,
      city: 'Усть-Каменогорск',
      cityKk: 'Өскемен',
      capacity: '5-7',
      skills: ['STM32', 'Датчики', 'CAD'],
      interests: ['city', 'eco'],
      lookingFor: ['backend', 'designer'],
      projects: 2,
      bio: {
        ru: 'Проектирует устройства для умного города и печатает корпуса на 3D-принтере.',
        kk: 'Ақылды қалаға арналған құрылғыларды жобалайды, корпустарды 3D-принтерде басып шығарады.'
      }
    },
    {
      id: 'p34',
      name: 'Ева Гринберг',
      initials: 'ЕГ',
      tone: 'coral',
      role: 'frontend',
      grade: 10,
      city: 'Онлайн',
      cityKk: 'Онлайн',
      capacity: 'gt7',
      skills: ['Vue', 'Nuxt', 'CSS-анимации'],
      interests: ['media', 'edtech'],
      lookingFor: ['designer', 'backend'],
      projects: 2,
      bio: {
        ru: 'Делает сайты с живыми анимациями и учится на онлайн-курсах. Работает удалённо.',
        kk: 'Жанды анимациялары бар сайттар жасайды, онлайн-курстарда оқиды. Қашықтан жұмыс істейді.'
      }
    },
    {
      id: 'p35',
      name: 'Али Касымов',
      initials: 'АК',
      tone: 'sky',
      role: 'data',
      grade: 10,
      city: 'Караганда',
      cityKk: 'Қарағанды',
      capacity: '5-7',
      skills: ['SQL', 'Tableau', 'Excel'],
      interests: ['sport', 'finance'],
      lookingFor: ['researcher', 'pm'],
      projects: 1,
      bio: {
        ru: 'Считает статистику соревнований и делает дашборды, которые понятны тренеру.',
        kk: 'Жарыстар статистикасын есептеп, жаттықтырушыға түсінікті дашбордтар жасайды.'
      }
    },
    {
      id: 'p36',
      name: 'Томирис Алиева',
      initials: 'ТА',
      tone: 'violet',
      role: 'researcher',
      grade: 9,
      city: 'Актобе',
      cityKk: 'Ақтөбе',
      capacity: '2-4',
      skills: ['Опросы', 'Работа с источниками', 'Презентации'],
      interests: ['bio', 'social'],
      lookingFor: ['designer', 'data'],
      projects: 0,
      bio: {
        ru: 'Готовит школьные исследования и аккуратно оформляет источники. Учится анализу данных.',
        kk: 'Мектеп зерттеулерін дайындайды, дереккөздерді ұқыпты рәсімдейді. Деректерді талдауды үйренеді.'
      }
    },
    {
      id: 'p37',
      name: 'Максим Орлов',
      initials: 'МО',
      tone: 'lime',
      role: 'backend',
      grade: 11,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: 'gt7',
      skills: ['C#', '.NET', 'API'],
      interests: ['games', 'finance'],
      lookingFor: ['frontend', 'designer'],
      projects: 3,
      bio: {
        ru: 'Пишет серверную часть для игровых прототипов и разбирается в сетевом коде.',
        kk: 'Ойын прототиптеріне серверлік бөлікті жазады, желілік кодты түсінеді.'
      }
    },
    {
      id: 'p38',
      name: 'Аделя Смагулова',
      initials: 'АС',
      tone: 'coral',
      role: 'designer',
      grade: 11,
      city: 'Алматы',
      cityKk: 'Алматы',
      capacity: '5-7',
      skills: ['UI/UX', 'Дизайн-системы', 'Figma'],
      interests: ['ai', 'edtech'],
      lookingFor: ['frontend', 'researcher'],
      projects: 2,
      bio: {
        ru: 'Собирает дизайн-системы для учебных сервисов и тестирует прототипы на одноклассниках.',
        kk: 'Оқу сервистеріне дизайн-жүйелер жасайды, прототиптерді сыныптастарымен тестілейді.'
      }
    },
    {
      id: 'p39',
      name: 'Нурия Жаксылык',
      initials: 'НЖ',
      tone: 'sky',
      role: 'marketing',
      grade: 10,
      city: 'Астана',
      cityKk: 'Астана',
      capacity: '5-7',
      skills: ['SMM', 'Аналитика', 'Контент'],
      interests: ['edtech', 'social'],
      lookingFor: ['media', 'designer'],
      projects: 1,
      bio: {
        ru: 'Ведёт аккаунты школьных проектов и проверяет гипотезы по цифрам, а не по вкусу.',
        kk: 'Мектеп жобаларының аккаунттарын жүргізеді, гипотезаларды дәмге емес, сандарға қарап тексереді.'
      }
    },
    {
      id: 'p40',
      name: 'Глеб Никитин',
      initials: 'ГН',
      tone: 'violet',
      role: 'pm',
      grade: 11,
      city: 'Онлайн',
      cityKk: 'Онлайн',
      capacity: '5-7',
      skills: ['Jira', 'Планирование', 'Питч'],
      interests: ['games', 'ai'],
      lookingFor: ['backend', 'designer'],
      projects: 2,
      bio: {
        ru: 'Ведёт игровые проекты: ставит задачи, следит за сроками и собирает обратную связь.',
        kk: 'Ойын жобаларын жүргізеді: тапсырмалар қояды, мерзімдерді қадағалап, кері байланыс жинайды.'
      }
    }
  ];

  window.PM_DATA = {
    version: VERSION,
    roles: ROLES,
    interests: INTERESTS,
    synonyms: SYNONYMS,
    profiles: PROFILES
  };
})();
