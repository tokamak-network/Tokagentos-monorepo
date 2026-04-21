require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'TokagentosCapacitorCamera'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license'] || { :type => 'MIT' }
  s.homepage = 'https://tokagentos.ai'
  s.authors = { 'tokagentOS' => 'dev@elizaos.ai' }
  s.source = { :git => 'https://github.com/tokagentOS/tokagent.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
  s.frameworks = 'AVFoundation', 'Photos', 'UIKit'
end
