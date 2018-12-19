"use strict";
//
// This file contains a JavaScript reimplementation of stress calculation
// code from the venneuler project (found in VennAnalytic.java).
//
// Author:  Michael Wybrow <Michael.Wybrow@monash.edu>
//
//
// The content of this file are subject to the terms of the Mozilla Public
// License, v. 1.1. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/1.1/.
//
// Copyright (c) 2009 by Leland Wilkinson.
// Copyright (c) 2018 by Monash University.
//
// Alternatively, the contents of this file may be used under the terms
// of the GNU General Public License Version 3, as described below:
//
// This file is free software: you may copy, redistribute and/or modify
// it under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.

// This file is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
// Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see http://www.gnu.org/licenses/.
//


class VennEulerAreas
{
    constructor(ellipseLabels, globalZoneStrings, globalProportions) {
        this.ellipseLabels = ellipseLabels.slice();
        this.globalZoneStrings = globalZoneStrings.slice();
        this.globalProportions = globalProportions.slice();
    }


    vennEulerAreasAndStress(ellipseParams)
    {
        // Copy each element of ellipseParams, since we will recenter.
        this.ellipseParamsCopy = [];
        for (let i = 0; i < ellipseParams.length; ++i)
        {
            this.ellipseParamsCopy[i] = Object.assign({}, ellipseParams[i]);
        }

        this._recenter();
        this._calculateAreas();

        this.polyData = [];
        for (let i = 0;  i < this.polyAreas.length; ++i)
        {
            var label = this._encodeLabelForEdeap(i);

            var index = this.globalZoneStrings.indexOf(label);
            var desiredArea = 0;
            if (index !== -1)
            {
                desiredArea = this.globalProportions[index];
            }
            this.polyData.push(desiredArea);
            //console.log(i + " label: " + label + ", area: " + desiredArea);
        }

        //console.log("Data:" + polyData);
        //console.log("Areas:" + polyAreas);

        var veStress = this._vennEulerStress()

        return veStress;
    }

    _vennEulerStress()
    {
        let startIndex = 1;

        var xx = 0;
        var xy = 0;
        let n = this.polyData.length;
        var sst = 0;
        for (let i = startIndex; i < n; i++)
        {
            let x = this.polyData[i];
            let y = this.polyAreas[i];
            xy += x * y;
            xx += x * x;
            sst += y * y;
        }
        let slope = xy / xx;

        var sse = 0;
        for (let i = startIndex; i < n; i++)
        {
            let x = this.polyData[i];
            let y = this.polyAreas[i];
            let yhat = x * slope;
            sse += (y - yhat) * (y - yhat);
        }
        return sse / sst;
    }

    _decode(subsets) {
        let b = "";
        for (let j = 0; j < subsets.length; j++)
        {
            if (subsets[j] > 0)
                b += "1";
            else
                b += "0";
        }
        return parseInt(b, 2);
    }

    _encodeLabelForEdeap(index)
    {
        let s = index.toString(2);

        while (s.length < this.ellipseParamsCopy.length)
        {
            s = "0" + s;
        }

        var labels = [];
        for (let i = 0; i < this.ellipseLabels.length; ++i)
        {
            if (s[i] === "1")
            {
                labels.push(this.ellipseLabels[i]);
            }
        }
        let zone = labels.join(",");

        return zone;
    }


    _updatePixels(counts)
    {
        let index = this._decode(counts);
        this.polyAreas[index]++;
        this.totalCount++;
    }


    _recenter() {
        const nCircles = this.ellipseParamsCopy.length;

        let cx = 0;
        let cy = 0;
        for (let i = 0; i < nCircles; i++)
        {
            cx += this.ellipseParamsCopy[i].X;
            cy += this.ellipseParamsCopy[i].Y;
        }
        cx = cx / nCircles;
        cy = cy / nCircles;
        for (let i = 0; i < nCircles; i++) {
            this.ellipseParamsCopy[i].X = .5 + this.ellipseParamsCopy[i].X - cx;
            this.ellipseParamsCopy[i].Y = .5 + this.ellipseParamsCopy[i].Y - cy;
        }
    }


    _calculateAreas()
    {
        this.totalCount = 0;
        let size = 200;
        const nCircles = this.ellipseParamsCopy.length;
        const nPolygons = Math.pow(2, nCircles);
        this.polyAreas = [];
        for (let n = 0; n < nPolygons; ++n)
        {
            this.polyAreas[n] = 0;
        }

        // Initialise bis bitmap for each ellipse.
        let bis = [];
        for (let n = 0; n < nCircles; ++n)
        {
            let row = [];
            for (let x = 0; x < size; ++x)
            {
                let col = [];
                for (let y = 0; y < size; ++y)
                {
                    col[y] = 0;
                }
                row[x] = col;
            }
            bis[n] = row;
        }

        // Find the bounding box of all circles.  This assumes that
        // recenter has been called prior to this function.
        let mins = Number.MAX_SAFE_INTEGER;
        let maxs = Number.MIN_SAFE_INTEGER;
        for (let i = 0; i < nCircles; i++)
        {
            let bb = ellipseBoundingBox(this.ellipseParamsCopy[i].X,
                    this.ellipseParamsCopy[i].Y, this.ellipseParamsCopy[i].A,
                    this.ellipseParamsCopy[i].B, this.ellipseParamsCopy[i].R);

            mins = Math.min(bb.p1.x, mins);
            mins = Math.min(bb.p1.y, mins);
            maxs = Math.max(bb.p2.x, maxs);
            maxs = Math.max(bb.p2.y, maxs);
        }

        // For each circle.
        for (let i = 0; i < nCircles; i++)
        {
            // xi, y1, and di are centre positions and diameters
            // scaled to lie between 0 and 1 (relative to bounding box).
            let scale = (maxs - mins);
            let xi = (this.ellipseParamsCopy[i].X - mins) / scale;
            let yi = (this.ellipseParamsCopy[i].Y - mins) / scale;
            let ai = this.ellipseParamsCopy[i].A / scale;
            let bi = this.ellipseParamsCopy[i].B / scale;

            xi *= size;
            yi *= size;
            ai *= size;
            bi *= size;

            for (let x = 0; x < size; x++)
            {
                for (let y = 0; y < size; y++)
                {
                    if (isInEllipse(x, y, xi, yi, ai, bi, this.ellipseParamsCopy[i].R))
                    {
                        bis[i][x][y] = 1;
                    }
                }
            }
            /*

            // Number of points in the radius of this circle.
            int r = (int) (di * size / 2.);

            // Take the square of the radius.  This saves us from
            // calculating the sqrt() of the distance calculated below,
            // by comparing the sqare of the distance with the square of
            // the radius, to see if the sampled point is within radius
            // distance from the centre.
            int r2 = r * r;

            // Circle position in sampled space.
            int cx = (int) (xi * size);
            // Y is inverted (size - y1).  Weird, shouldn't make any difference.
            int cy = (int) (size - yi * size);

            // For each point in sampled space
            for (int x = 0; x < size; x++) {
                for (int y = 0; y < size; y++) {

                    // Compute the distance between two points squared and
                    // see if this is less than the squared radius to see if
                    // the point is within the circle.  If so, mark it as
                    // such.
                    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r2)
                        bis[i][x][y] = 1;
                }
            }
            */
        }

        // For each point in sampled space
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                let counts = []
                for (let n = 0; n < nCircles; ++n)
                {
                    counts[n] = 0;
                }
                let count = 0;
                for (let j = 0; j < nCircles; j++)
                {
                    if (bis[j][x][y] === 1)
                    {
                        counts[j]++;
                        count++;
                    }
                }
                if (count > 0)
                {
                    this._updatePixels(counts);
                }
            }
        }
        if (this.totalCount === 0)
        {
            return;
        }

        for (let i = 0; i < nPolygons; i++)
        {
            this.polyAreas[i] = 100 * this.polyAreas[i] / this.totalCount;
        }
    }

}
