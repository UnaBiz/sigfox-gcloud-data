#!/bin/bash

name=sendToUbidots
localpath=.
trigger=--trigger-topic
topic=sigfox.types.${name}
export options="--memory=1024MB --timeout=500"

./scripts/functiondeploy.sh ${name}   ${localpath} ${trigger} ${topic}
