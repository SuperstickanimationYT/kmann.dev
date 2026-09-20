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
  item.append(project.status === 'live' ? createLiveCard(project) : createPlannedCard(project));
  return item;
}

function renderProjects() {
  const grid = document.querySelector('[data-project-grid]');
  if (!grid) {
    return;
  }

  if (PROJECTS.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'grid-empty';
    empty.textContent = 'Nothing here yet.';
    grid.append(empty);
    return;
  }

  grid.append(...PROJECTS.map(createCard));
}

renderProjects();
