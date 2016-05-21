const gulp = require('gulp');
const babel = require('gulp-babel');
const concat = require('gulp-concat');

gulp.task('default', () => {
	return gulp.src(['src/lib/epubcfi.js','src/nav.js','src/epub.js'])
		.pipe(babel({presets: ['es2015']}))
		.pipe(concat('epub.js'))
		.pipe(gulp.dest('dist'));
});