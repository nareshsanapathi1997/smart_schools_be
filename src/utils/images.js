// Local themed images — paths served from Next.js /public/images
const local = (file) => `/images/${file}`;

const IMG = {
  hero: local('hero.jpg'),
  campus: local('campus.jpg'),
  classroom: local('classroom.jpg'),
  lab: local('lab.jpg'),
  library: local('library.jpg'),
  sports: local('sports.jpg'),
  event: local('event.jpg'),
  course: local('course.jpg'),
  f1: local('faculty1.jpg'),
  f2: local('faculty2.jpg'),
  f3: local('faculty3.jpg'),
  f4: local('faculty4.jpg'),
  f5: local('faculty5.jpg'),
  f6: local('faculty6.jpg'),
  t1: local('testimonial1.jpg'),
  t2: local('testimonial2.jpg'),
  t3: local('testimonial3.jpg'),
  achieve: local('achievement.jpg'),
  gallery1: local('gallery1.jpg'),
  gallery2: local('gallery2.jpg'),
  gallery3: local('gallery3.jpg'),
  gallery4: local('gallery4.jpg'),
  gallery5: local('gallery5.jpg'),
  gallery6: local('gallery6.jpg'),
  videoThumb: local('video-thumb.jpg'),
};

const VIDEO = 'https://www.youtube.com/embed/ScMzIvxBSi4';

module.exports = { IMG, VIDEO };
