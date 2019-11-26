#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { SkaffoldPipelineCdkStack } from '../lib/skaffold-pipeline-cdk-stack';

const app = new cdk.App();
new SkaffoldPipelineCdkStack(app, 'SkaffoldPipelineCdkStack');
