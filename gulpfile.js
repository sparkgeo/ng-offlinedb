var gulp = require('gulp');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');

gulp.task('build', function() {
  gulp.src('src/ng-offlinedb.js')
      .pipe(uglify())
      .pipe(rename({ suffix: '.min' }))
      .pipe(gulp.dest('dist'));
});