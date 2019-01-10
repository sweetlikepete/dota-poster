

const fetch = require("node-fetch");
const $ = require("cheerio");
const dominantColor = require("dominant-color");
const path = require("path");
const urlLib = require("url");
const fs = require("fs-extra");
const request = require("request");
const rgbToHsl = require("rgb-to-hsl");
const jimp = require("jimp");
const imageColorAverage = require("image-average-color");


const scrapePage = async function(url, selector = "div.thumb", first = true){

    console.log(`Scraping page: ${ url }`);

    const response = await fetch(url);
    const text = await response.text();
    const html = $(text);
    const next = html.find("a:contains('next page')");
    const parsedURL = urlLib.parse(url);
    const base = `${ parsedURL.protocol }\/\/${ parsedURL.hostname }`;

    let images = [];

    html.find(`${ selector } img`).each((index, img) => {

        images.push($(img).attr("src"));

    });

    if(next.length && next.attr("href")){

        const nextURL = `${ parsedURL.protocol }//${ path.join(parsedURL.hostname, next.attr("href")) }`;
        const nextImages = await scrapePage(nextURL, selector, false);

        images = images.concat(nextImages);

    }

    return images;

};

const downloadImage = async function(url, filename){

    return new Promise((resolve) => {

        if(fs.existsSync(filename)){

            console.log(`Downloaded image: ${ url }`);

            resolve(filename);

        }else{

            request(url).pipe(fs.createWriteStream(filename)).on("close", () => {

                console.log(`Downloaded image: ${ url }`);

                resolve(filename);

            });

        }

    });

};

const getDominantHue = async function(filename){

    return new Promise((resolve) => {

        dominantColor(filename, {format: "rgb"}, (err, color) => {
        // imageColorAverage(filename, (err, color) => {

            if(err){

                console.log(err);
                console.log(filename);

            }

            console.log([err, color]);

            const hsl = rgbToHsl(color[0], color[1], color[2]);

            resolve(hsl[0]);

        });

    });

};

const createPoster = async function({
    images,
    width,
    height,
    filename
}){

    return new Promise((resolve) => {

        const tileWidth = images[0].bitmap.width;
        const tileHeight = images[0].bitmap.height;

        new jimp(width * tileWidth, height * tileHeight, 0xff0000ff, (err, image) => {

            let row = 0
            let col = 0

            images.forEach((img, index) => {

                if(col === width){
                    col = 0
                    row += 1
                }

                console.log(`Merging image ${ index + 1 } of ${ images.length }`);

                image.composite(img, col * tileWidth, row * tileHeight, {
                    opacitySource: 1,
                    opacityDest: 1
                });

                col += 1;

            });

            image.quality(80).write(filename);

            console.log(`Created poster: ${ filename }`);

            resolve();

        });

    });

};

const getAllImages = async function(){

    let images = await scrapePage("https://dota2.gamepedia.com/Category:Hero_icons");

    images = images.map(url => {
        return url.replace("/thumb", "").replace(/\/[0-9]*px-.*$/, "");
    });

    const outputDir = path.join(process.cwd(), "images");

    await fs.ensureDir(outputDir);

    const downloads = await Promise.all(images.map((url) => {
        return downloadImage(url, path.join(outputDir, path.basename(url)));
    }));

    const hues = await Promise.all(downloads.map((filename) => {
        return getDominantHue(filename);
    }));

    const imageMap = await Promise.all(downloads.map((filename, index) => {

        return new Promise((resolve) => {

            jimp.read(filename).then((image) => {

                resolve({
                    filename,
                    hue: hues[index],
                    image
                })

            });

        });

    }));

    imageMap.sort((a, b) => a.hue - b.hue);

    images = imageMap.map((image) => image.image);

    await createPoster({
        width: 13,
        height: 9,
        images,
        filename: path.join(process.cwd(), "wide.jpg")
    });

    await createPoster({
        width: 9,
        height: 13,
        images,
        filename: path.join(process.cwd(), "square.jpg")
    });

};

getAllImages();
