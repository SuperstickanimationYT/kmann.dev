function createPoster(project) {
  const poster = document.createElement('span');
  poster.className = 'card-poster';

  if (!project.poster) {
    poster.classList.add('card-poster-blank');
    return poster;
  }

  const image = document.createElement('img');
  image.src = project.poster;
  image.alt = '';
  image.loading = 'lazy';
  poster.append(image);
  return poster;
}

function createTitle(project) {
  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = project.title;
  return title;
}

function createLiveCard(project) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = project.href;
  if (project.blurb) {
    card.title = project.blurb;
  }
  card.append(createPoster(project), createTitle(project));
  return card;
}

function createPlannedCard(project) {
  const card = document.createElement('div');
  card.className = 'card card-planned';

  const tag = document.createElement('span');
  tag.className = 'card-tag';
  tag.textContent = 'Planned';

  card.append(createTitle(project), tag);
  return card;
}

function createCard(project) {
  const item = document.createElement('li');
  item.dataset.searchText = `${project.title} ${project.blurb ?? ''}`.toLowerCase();
  item.append(project.status === 'planned' ? createPlannedCard(project) : createLiveCard(project));
  return item;
}

function createGrid(projects) {
  const grid = document.createElement('ul');
  grid.className = 'project-grid';
  grid.append(...projects.map(createCard));
  return grid;
}

function createSection(category) {
  const section = document.createElement('section');
  section.className = 'project-section';

  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = category.title;

  const projects = PROJECTS.filter((project) => project.category === category.id && project.status !== 'wip');
  section.append(heading, createGrid(projects));
  return section;
}

function createPrototypeShelf() {
  const projects = PROJECTS.filter((project) => project.status === 'wip');
  const shelf = document.createElement('details');
  shelf.className = 'project-section prototype-shelf';

  const summary = document.createElement('summary');
  summary.className = 'section-title';
  summary.textContent = `Prototypes (${projects.length})`;

  const note = document.createElement('p');
  note.className = 'prototype-note';
  note.textContent = 'Unfinished apps. Fun to try, but expect bugs and missing parts.';

  shelf.append(summary, note, createGrid(projects));
  return shelf;
}

function filterSections(sections, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let shownSections = 0;

  for (const section of sections) {
    let shownCards = 0;
    for (const item of section.querySelectorAll('li')) {
      item.hidden = !words.every((word) => item.dataset.searchText.includes(word));
      shownCards += item.hidden ? 0 : 1;
    }
    section.hidden = shownCards === 0;
    shownSections += section.hidden ? 0 : 1;
  }

  return shownSections;
}

function renderProjects() {
  const container = document.querySelector('[data-project-sections]');
  const search = document.querySelector('[data-project-search]');
  const empty = document.querySelector('[data-project-empty]');
  if (!container) {
    return;
  }

  const shelf = createPrototypeShelf();
  const sections = [...CATEGORIES.map(createSection), shelf];
  container.append(...sections);

  const update = () => {
    const query = search?.value ?? '';
    const shown = filterSections(sections, query);
    if (query.trim() && !shelf.hidden) {
      shelf.open = true;
    }
    if (empty) {
      empty.hidden = shown > 0;
    }
  };

  search?.addEventListener('input', update);
  update();
}

renderProjects();
