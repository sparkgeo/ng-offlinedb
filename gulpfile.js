var gulp = require('gulp');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var connect = require('gulp-connect');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');

gulp.task('test', function() {
  gulp.src('src/ng-offlinedb.js')
      .pipe(jshint())
      .pipe(jshint.reporter(stylish));
});

gulp.task('build', function() {
  gulp.src('src/ng-offlinedb.js')
      .pipe(uglify())
      .pipe(rename({ suffix: '.min' }))
      .pipe(gulp.dest('dist'));
});

gulp.task('webserver', function() {
  connect.server({
    livereload: true,
    port: 7777
  });
});