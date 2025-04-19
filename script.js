const githubUsername = 'satyajitlion'; // Replace with your GitHub username
const apiUrl = `https://api.github.com/users/${githubUsername}/repos`;

fetch(apiUrl)
  .then(response => response.json())
  .then(repos => {
    const projectsList = document.getElementById('projects-list');

    repos
      .filter(repo => !repo.fork) // Optional: exclude forks
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)) // recent first
      .forEach(repo => {
        const projectDiv = document.createElement('div');
        projectDiv.classList.add('project-card');

        const projectTitle = document.createElement('h3');
        projectTitle.textContent = repo.name;

        const projectDesc = document.createElement('p');
        projectDesc.textContent = repo.description || 'No description provided.';

        const projectLink = document.createElement('a');
        projectLink.href = repo.html_url;
        projectLink.target = '_blank';
        projectLink.textContent = 'View on GitHub →';

        projectDiv.appendChild(projectTitle);
        projectDiv.appendChild(projectDesc);
        projectDiv.appendChild(projectLink);

        projectsList.appendChild(projectDiv);
      });
  })
  .catch(error => {
    console.error('Error fetching GitHub repositories:', error);
  });